/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Express, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import fsPromises from 'fs/promises';
import http from 'node:http';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { ipcBridge } from '@/common';
import { getSystemDir } from '@process/utils/initStorage';
import { ProcessConfig } from '@process/utils/initStorage';
import { TokenMiddleware } from '@process/webserver/auth/middleware/TokenMiddleware';
import { SpeechToTextService } from '@process/bridge/services/SpeechToTextService';
import { isActivePreviewPort } from '@process/bridge/pptPreviewBridge';
import { isActiveOfficeWatchPort } from '@process/bridge/officeWatchBridge';
import { AIONUI_TIMESTAMP_SEPARATOR } from '@/common/config/constants';
import directoryApi from '../directoryApi';
import { apiRateLimiter } from '../middleware/security';
/** Temp directory used by multer disk storage — validated at runtime to prevent path traversal */
const MULTER_TEMP_DIR = os.tmpdir();

/** File upload: disk storage so large files are streamed rather than buffered in memory */
const uploadDisk = multer({ storage: multer.diskStorage({ destination: MULTER_TEMP_DIR }) });

/** STT upload: memory storage so the audio buffer is available directly for transcription */
const MAX_AUDIO_SIZE = 30 * 1024 * 1024;
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE },
});

/**
 * Decode filename from multer.
 * Multer v2 decodes Content-Disposition filename as Latin-1 (per HTTP spec),
 * but browsers encode non-ASCII filenames (CJK, etc.) as UTF-8 bytes.
 * Re-encode the Latin-1 string back to raw bytes and decode as UTF-8.
 */
function decodeMulterFileName(raw: string): string {
  try {
    const bytes = Buffer.from(raw, 'latin1');
    return bytes.toString('utf8');
  } catch {
    return raw;
  }
}

function sanitizeFileName(file_name: string): string {
  const decoded = decodeMulterFileName(file_name);
  const basename = path.basename(decoded);
  const safe = basename.replace(/[<>:"/\\|?*]/g, '_');
  if (!safe || safe === '.' || safe === '..') return `file_${Date.now()}`;
  return safe;
}

export async function resolveUploadWorkspace(conversation_id: string, requestedWorkspace?: string): Promise<string> {
  if (!conversation_id) {
    throw new Error('Missing conversation id');
  }

  const conversation = await ipcBridge.conversation.get.invoke({ id: conversation_id }).catch((): null => null);
  const extra = (conversation?.extra as Record<string, unknown> | undefined) ?? {};
  const conversationWorkspace = typeof extra.workspace === 'string' ? extra.workspace : '';
  if (!conversationWorkspace) {
    throw new Error('Conversation workspace not found');
  }

  const resolvedConversationWorkspace = path.resolve(conversationWorkspace);
  if (requestedWorkspace && path.resolve(requestedWorkspace) !== resolvedConversationWorkspace) {
    throw new Error('Workspace mismatch');
  }

  return resolvedConversationWorkspace;
}

async function getTempUploadDir(): Promise<string> {
  const { cacheDir } = getSystemDir();
  const tempDir = path.join(cacheDir, 'temp');
  await fsPromises.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * 注册 API 路由
 * Register API routes
 */
export function registerApiRoutes(app: Express): void {
  const validateApiAccess = TokenMiddleware.validateToken({
    responseType: 'json',
  });

  /**
   * 目录 API - Directory API
   * /api/directory/*
   */
  app.use('/api/directory', apiRateLimiter, validateApiAccess, directoryApi);

  /**
   * 上传文件 - Upload file
   * POST /api/upload
   * WebUI 模式下粘贴/拖拽/选择文件时，通过 HTTP multipart 上传到 workspace
   * Used in WebUI mode for paste/drag/pick files via HTTP multipart upload
   *
   * Must be registered BEFORE extension webui routes and catch-all /api route
   *
   * NOTE: multer v2 passes file-size errors to Express's next() rather than
   * throwing inside the route handler. We wrap upload.single() manually so
   * LIMIT_FILE_SIZE is intercepted and returns 413 before entering the handler.
   */
  app.post(
    '/api/upload',
    apiRateLimiter,
    validateApiAccess,
    (req: Request, res: Response, next: NextFunction) => {
      uploadDisk.single('file')(req, res, (err: unknown) => {
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        const conversation_id = typeof req.body.conversation_id === 'string' ? req.body.conversation_id : '';
        const requestedWorkspace = typeof req.body.workspace === 'string' ? req.body.workspace : '';

        if (!file) {
          res.status(400).json({ success: false, msg: 'Missing file' });
          return;
        }

        let uploadDir: string;
        // Check user preference: save to workspace or cache directory
        // Default to cache directory (false) to avoid cluttering workspace
        const saveToWorkspace = await ProcessConfig.get('upload.saveToWorkspace').catch(() => false);
        if (conversation_id && saveToWorkspace) {
          let workspace: string;
          try {
            workspace = await resolveUploadWorkspace(conversation_id, requestedWorkspace);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid upload workspace';
            const statusCode =
              message === 'Conversation workspace not found' || message === 'Missing conversation id' ? 400 : 403;
            res.status(statusCode).json({ success: false, msg: message });
            return;
          }
          uploadDir = path.join(workspace, 'uploads');
          await fsPromises.mkdir(uploadDir, { recursive: true });
        } else {
          if (requestedWorkspace) {
            res.status(403).json({
              success: false,
              msg: 'Workspace uploads require conversation id',
            });
            return;
          }
          uploadDir = await getTempUploadDir();
        }

        const safeFileName = sanitizeFileName(file.originalname);
        let targetPath = path.join(uploadDir, safeFileName);

        // Check for duplicate and append timestamp if needed
        try {
          await fsPromises.access(targetPath);
          // File exists, append timestamp
          const ext = path.extname(safeFileName);
          const name = path.basename(safeFileName, ext);
          targetPath = path.join(uploadDir, `${name}${AIONUI_TIMESTAMP_SEPARATOR}${Date.now()}${ext}`);
        } catch {
          // File doesn't exist, proceed with original name
        }

        // Verify path is still within uploadDir (defense in depth)
        const resolvedTarget = path.resolve(targetPath);
        const resolvedUploadDir = path.resolve(uploadDir);
        if (!resolvedTarget.startsWith(resolvedUploadDir + path.sep) && resolvedTarget !== resolvedUploadDir) {
          res.status(400).json({ success: false, msg: 'Invalid file name' });
          return;
        }

        // Reconstruct the source path from a trusted base + only the filename component of file.path.
        // This breaks the taint chain: path.basename() strips any directory traversal sequences,
        // and MULTER_TEMP_DIR is a constant set at startup, not user-provided.
        const safeTempPath = path.join(path.resolve(MULTER_TEMP_DIR), path.basename(file.path));
        await fsPromises.rename(safeTempPath, targetPath);

        res.json({
          success: true,
          data: {
            path: targetPath,
            name: path.basename(targetPath),
            size: file.size,
            type: file.mimetype || 'application/octet-stream',
          },
        });
      } catch (error) {
        console.error('[API] Upload file error:', error);
        res.status(500).json({
          success: false,
          msg: error instanceof Error ? error.message : 'Failed to upload file',
        });
      }
    }
  );

  app.post(
    '/api/stt',
    apiRateLimiter,
    validateApiAccess,
    (req: Request, res: Response, next: NextFunction) => {
      uploadAudio.single('audio')(req, res, (err: unknown) => {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            success: false,
            msg: `Audio file too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)`,
          });
          return;
        }
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const audio = req.file;
        const languageHint = typeof req.body.languageHint === 'string' ? req.body.languageHint : undefined;
        const mimeType =
          typeof req.body.mimeType === 'string' && req.body.mimeType.trim().length > 0
            ? req.body.mimeType
            : audio?.mimetype || 'application/octet-stream';

        if (!audio) {
          res.status(400).json({ success: false, msg: 'Missing audio file' });
          return;
        }

        const result = await SpeechToTextService.transcribe({
          audioBuffer: Uint8Array.from(audio.buffer),
          file_name: sanitizeFileName(audio.originalname || `speech-${Date.now()}.webm`),
          languageHint,
          mimeType,
        });

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error('[API] Speech-to-text error:', error);
        res.status(500).json({
          success: false,
          msg: error instanceof Error ? error.message : 'Speech-to-text failed',
        });
      }
    }
  );

  /**
   * Shared reverse proxy handler for officecli watch servers.
   *
   * Guards against SSRF by validating the port against active sessions.
   * Rewrites Location headers and injects a navigation guard script into HTML
   * responses so the preview iframe cannot escape the proxy base path.
   */
  function registerOfficecliWatchProxy(
    routePath: string,
    portValidator: (port: number) => boolean,
    sessionLabel: string
  ): void {
    app.use(routePath + '/:port', apiRateLimiter, validateApiAccess, (req: Request, res: Response) => {
      const port = parseInt(req.params.port as string, 10);
      if (isNaN(port) || !portValidator(port)) {
        res.status(404).json({ message: `${sessionLabel} session not found` });
        return;
      }

      const subPath = req.path || '/';
      const queryIndex = req.url.indexOf('?');
      const query = queryIndex !== -1 ? req.url.slice(queryIndex) : '';

      // Strip hop-by-hop headers and auth before forwarding to local officecli server
      const hopByHop = new Set([
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
        'cookie',
        'authorization',
      ]);
      const proxyHeaders: Record<string, string | string[]> = { host: `127.0.0.1:${port}` };
      for (const [key, value] of Object.entries(req.headers)) {
        if (!hopByHop.has(key.toLowerCase()) && value !== undefined) {
          proxyHeaders[key] = value as string | string[];
        }
      }

      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: subPath + query,
          method: req.method,
          headers: proxyHeaders,
          timeout: 30_000,
        },
        (proxyRes) => {
          const statusCode = proxyRes.statusCode ?? 200;

          // Rewrite Location headers so the browser follows redirects through the proxy
          // instead of hitting http://localhost:PORT directly (which the browser can't reach).
          const responseHeaders: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (key.toLowerCase() === 'location' && typeof value === 'string') {
              // Rewrite absolute localhost URLs
              let rewritten = value.replace(
                new RegExp(`^https?://(?:localhost|127\\.0\\.0\\.1):${port}`),
                `${routePath}/${port}`
              );
              // Also rewrite root-relative paths (e.g. Location: /) through the proxy
              if (rewritten === '/' || (rewritten.startsWith('/') && !rewritten.startsWith(routePath))) {
                rewritten = `${routePath}/${port}${rewritten === '/' ? '/' : rewritten}`;
              }
              responseHeaders[key] = rewritten;
            } else if (value !== undefined) {
              responseHeaders[key] = value as string | string[];
            }
          }
          // Override global X-Frame-Options: deny so the proxy URL can be loaded inside an iframe.
          // The injected guard script prevents the iframe from navigating outside the proxy base path.
          // cspell:ignore SAMEORIGIN
          responseHeaders['x-frame-options'] = 'SAMEORIGIN';

          // For HTML responses, buffer and inject a navigation guard script so that
          // the preview page JS cannot navigate the iframe to the root app URL.
          const contentType = String(responseHeaders['content-type'] ?? '');
          if (contentType.includes('text/html')) {
            const proxyBase = `${routePath}/${port}`;
            // Injected as the first script in <head> so it runs before any page scripts.
            const guardScript = `<script>
(function(b){
  function rw(u){if(!u)return u;var s=String(u);var m=/^https?:\\/\\/(?:localhost|127\\.0\\.0\\.1)(:\\d+)?(\\/.*)?$/.exec(s);if(m){var p=m[2]||'/';if(!p.startsWith(b))return b+(p==='/'?'/':p);}if(s==='/'||(s[0]==='/'&&s[1]!=='/'&&!s.startsWith(b)))return b+(s==='/'?'/':s);return s;}
  var _a=location.assign.bind(location),_r=location.replace.bind(location);
  location.assign=function(u){_a(rw(u));};location.replace=function(u){_r(rw(u));};
  var _ps=history.pushState.bind(history),_rs=history.replaceState.bind(history);
  history.pushState=function(s,t,u){_ps(s,t,u?rw(u):u);};history.replaceState=function(s,t,u){_rs(s,t,u?rw(u):u);};
  try{Object.defineProperty(location,'href',{set:function(v){_a(rw(v));},configurable:true});}catch(e){}
  document.addEventListener('click',function(e){var t=e.target;while(t&&t.tagName!=='A')t=t.parentElement;if(t&&t.tagName==='A'){var h=t.getAttribute('href');if(h&&(h[0]==='/'&&h[1]!=='/'&&!h.startsWith(b))){e.preventDefault();_a(b+h);}}},true);
})('${proxyBase}');
</script>`;

            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              let html = Buffer.concat(chunks).toString('utf8');
              // Inject right after opening <head> tag so the guard runs first
              if (/<head[^>]*>/i.test(html)) {
                html = html.replace(/(<head[^>]*>)/i, `$1${guardScript}`);
              } else {
                html = guardScript + html;
              }
              delete responseHeaders['content-length']; // length changed after injection
              res.removeHeader('X-Frame-Options');
              res.writeHead(statusCode, responseHeaders);
              res.end(html);
            });
            proxyRes.on('error', () => {
              if (!res.headersSent) res.status(502).end();
            });
          } else {
            res.removeHeader('X-Frame-Options');
            res.writeHead(statusCode, responseHeaders);
            proxyRes.on('error', () => {
              // headers already sent via writeHead — can't change status, just destroy
              res.destroy();
            });
            proxyRes.pipe(res, { end: true });
          }
        }
      );

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) res.status(504).json({ message: `${sessionLabel} proxy timeout` });
      });

      proxyReq.on('error', () => {
        if (!res.headersSent) res.status(502).json({ message: `${sessionLabel} proxy error` });
      });

      req.pipe(proxyReq, { end: true });
    });
  }

  /**
   * PPT 预览反向代理 - PPT Preview Reverse Proxy
   * GET /api/ppt-proxy/:port/*
   */
  registerOfficecliWatchProxy('/api/ppt-proxy', isActivePreviewPort, 'PPT preview');

  /**
   * Office Watch 预览反向代理 (Word & Excel) - Office Watch Preview Reverse Proxy
   * GET /api/office-watch-proxy/:port/*
   */
  registerOfficecliWatchProxy('/api/office-watch-proxy', isActiveOfficeWatchPort, 'Office watch preview');

  /**
   * 通用 API 端点 - Generic API endpoint
   * GET /api
   */
  app.use('/api', apiRateLimiter, validateApiAccess, (_req: Request, res: Response) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });
}

export default registerApiRoutes;
