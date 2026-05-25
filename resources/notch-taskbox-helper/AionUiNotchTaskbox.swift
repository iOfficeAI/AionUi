import AppKit
import Darwin
import Foundation
import WebKit

final class IslandPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

enum ScreenDetector {
    static func notchRect(screen: NSScreen) -> NSRect? {
        if #available(macOS 12.0, *) {
            guard let topLeft = screen.auxiliaryTopLeftArea,
                  let topRight = screen.auxiliaryTopRightArea else {
                return nil
            }

            let screenFrame = screen.frame
            let notchX = screenFrame.origin.x + topLeft.width
            let notchWidth = screenFrame.width - topLeft.width - topRight.width
            let notchY = screenFrame.maxY - max(topLeft.height, topRight.height)
            let notchHeight = max(topLeft.height, topRight.height)

            return NSRect(x: notchX, y: notchY, width: notchWidth, height: notchHeight)
        }
        return nil
    }
}

protocol NotchHoverDelegate: AnyObject {
    func notchHoverDidEnter()
    func notchHoverDidExit()
}

final class TrackingWebView: WKWebView {
    weak var hoverDelegate: NotchHoverDelegate?
    private var hoverTrackingArea: NSTrackingArea?

    override var acceptsFirstResponder: Bool { true }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        return true
    }

    override func updateTrackingAreas() {
        if let hoverTrackingArea = hoverTrackingArea {
            removeTrackingArea(hoverTrackingArea)
        }

        let area = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .inVisibleRect, .mouseEnteredAndExited, .mouseMoved],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        hoverTrackingArea = area
        super.updateTrackingAreas()
    }

    override func mouseEntered(with event: NSEvent) {
        hoverDelegate?.notchHoverDidEnter()
        super.mouseEntered(with: event)
    }

    override func mouseMoved(with event: NSEvent) {
        hoverDelegate?.notchHoverDidEnter()
        super.mouseMoved(with: event)
    }

    override func mouseExited(with event: NSEvent) {
        hoverDelegate?.notchHoverDidExit()
        super.mouseExited(with: event)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, NotchHoverDelegate {
    private var panel: IslandPanel?
    private var webView: WKWebView?
    private let apiURL: URL
    private let reservesHardwareNotch: Bool
    private let parentPID: pid_t?
    private var isExpanded = false
    private var collapseWorkItem: DispatchWorkItem?
    private var pointerWatchdog: Timer?
    private var parentWatchdog: Timer?
    private var globalMouseMonitor: Any?
    private var localMouseMonitor: Any?

    init(apiURL: URL, reservesHardwareNotch: Bool, parentPID: pid_t?) {
        self.apiURL = apiURL
        self.reservesHardwareNotch = reservesHardwareNotch
        self.parentPID = parentPID
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        createPanel()
        installEventMonitors()
        startPointerWatchdog()
        startParentWatchdog()
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let globalMouseMonitor = globalMouseMonitor {
            NSEvent.removeMonitor(globalMouseMonitor)
        }
        if let localMouseMonitor = localMouseMonitor {
            NSEvent.removeMonitor(localMouseMonitor)
        }
        pointerWatchdog?.invalidate()
        parentWatchdog?.invalidate()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "aionuiHost" else { return }
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "expand":
            setExpanded(true)
        case "compact":
            setExpanded(false)
        default:
            break
        }
    }

    func notchHoverDidEnter() {
        collapseWorkItem?.cancel()
        setExpanded(true)
    }

    func notchHoverDidExit() {
        scheduleCollapse(after: 0.08)
    }

    private func createPanel() {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "aionuiHost")

        let webView = TrackingWebView(frame: .zero, configuration: configuration)
        webView.hoverDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        self.webView = webView

        let panel = IslandPanel(
            contentRect: frame(expanded: false),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = false
        panel.acceptsMouseMovedEvents = true
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = false
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.animationBehavior = .none
        panel.becomesKeyOnlyIfNeeded = false
        panel.contentView = webView
        self.panel = panel

        webView.loadHTMLString(
            Self.html(
                apiBase: apiURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
                reservesHardwareNotch: reservesHardwareNotch,
                notchGap: notchGap()
            ),
            baseURL: apiURL
        )
        panel.orderFrontRegardless()
    }

    private func setExpanded(_ expanded: Bool) {
        collapseWorkItem?.cancel()
        guard isExpanded != expanded else { return }
        isExpanded = expanded
        if expanded {
            panel?.orderFrontRegardless()
            panel?.makeKey()
        }
        webView?.evaluateJavaScript("window.setHostExpanded && window.setHostExpanded(\(expanded ? "true" : "false"))")

        NSAnimationContext.runAnimationGroup { context in
            context.duration = expanded ? 0.48 : 0.38
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.18, 1.0, 0.28, 1.0)
            panel?.animator().setFrame(frame(expanded: expanded), display: true)
        }
    }

    private func scheduleCollapse(after delay: TimeInterval) {
        collapseWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.collapseIfPointerOutside()
        }
        collapseWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
    }

    private func collapseIfPointerOutside() {
        guard isExpanded, let panel = panel else { return }
        let pointer = NSEvent.mouseLocation
        let hitFrame = panel.frame.insetBy(dx: -6, dy: -8)
        if !hitFrame.contains(pointer) {
            setExpanded(false)
        }
    }

    private func installEventMonitors() {
        let mouseDownMask: NSEvent.EventTypeMask = [.leftMouseDown, .rightMouseDown, .otherMouseDown]
        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: mouseDownMask) { [weak self] _ in
            DispatchQueue.main.async {
                self?.collapseIfPointerOutside()
            }
        }
        localMouseMonitor = NSEvent.addLocalMonitorForEvents(matching: mouseDownMask) { [weak self] event in
            self?.collapseIfPointerOutside()
            return event
        }
    }

    private func startPointerWatchdog() {
        let timer = Timer(timeInterval: 0.06, repeats: true) { [weak self] _ in
            guard let self = self, let panel = self.panel else { return }
            let pointer = NSEvent.mouseLocation
            let hitFrame = panel.frame.insetBy(dx: -4, dy: -6)
            if hitFrame.contains(pointer) {
                if !self.isExpanded {
                    self.setExpanded(true)
                }
            } else if self.isExpanded {
                self.setExpanded(false)
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        pointerWatchdog = timer
    }

    private func startParentWatchdog() {
        guard let parentPID = parentPID, parentPID > 1 else { return }
        let timer = Timer(timeInterval: 0.5, repeats: true) { _ in
            if Darwin.kill(parentPID, 0) != 0 {
                NSApp.terminate(nil)
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        parentWatchdog = timer
    }

    private func frame(expanded: Bool) -> NSRect {
        let screen = NSScreen.main ?? NSScreen.screens.first!
        let screenFrame = screen.frame
        let notch = ScreenDetector.notchRect(screen: screen)
        let compactWidth = reservesHardwareNotch ? max(CGFloat(472), (notch?.width ?? 172) + 300) : 408
        let compactHeight = reservesHardwareNotch ? max(CGFloat(40), (notch?.height ?? 32) + 4) : 40
        let expandedWidth = min(CGFloat(560), screenFrame.width - 32)
        let expandedHeight = min(CGFloat(392), screenFrame.height - 96)
        let width: CGFloat = expanded ? expandedWidth : compactWidth
        let height: CGFloat = expanded ? expandedHeight : compactHeight
        let anchorX = notch?.midX ?? screenFrame.midX
        let anchorY = notch?.maxY ?? screenFrame.maxY
        return NSRect(x: anchorX - width / 2, y: anchorY - height, width: width, height: height)
    }

    private func notchGap() -> Int {
        guard reservesHardwareNotch else { return 0 }
        let screen = NSScreen.main ?? NSScreen.screens.first!
        let width = ScreenDetector.notchRect(screen: screen)?.width ?? 172
        return Int(max(CGFloat(182), width + 24))
    }

    private static func html(apiBase: String, reservesHardwareNotch: Bool, notchGap: Int) -> String {
        return """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;color:rgba(255,255,255,.94);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;user-select:none}
body{padding:0 10px 16px}
button,textarea{font:inherit}
.shell{width:100%;height:100%;overflow:visible;border-radius:0 0 18px 18px;background:transparent;transform-origin:top center;transition:border-radius .38s cubic-bezier(.18,1,.28,1),filter .38s cubic-bezier(.18,1,.28,1)}
.shell.expanded{border-radius:0 0 24px 24px;filter:drop-shadow(0 8px 12px rgba(0,0,0,.58)) drop-shadow(0 24px 42px rgba(0,0,0,.36))}
.surface{width:100%;min-height:40px;max-height:calc(100vh - 16px);overflow:hidden;border-radius:inherit;background:linear-gradient(180deg,rgba(5,5,6,.99),rgba(0,0,0,.97));box-shadow:inset 0 -1px 0 rgba(255,255,255,.05)}
.compact{height:40px;padding:4px 16px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;cursor:default}
.hardware-notch .compact{grid-template-columns:minmax(126px,1fr) var(--notch-gap) minmax(126px,1fr);gap:0}
.slot{min-width:0;display:flex;align-items:center;gap:8px}
.slot.trailing{justify-content:flex-end}
.center-gap{height:1px}
.shell:not(.hardware-notch) .center-gap{display:none}
.dot{width:9px;height:9px;border-radius:999px;background:#74777f;box-shadow:0 0 12px currentColor;flex:0 0 auto}
.dot.Working{background:#8f7cff;color:#8f7cff}.dot.Waiting{background:#ffc247;color:#ffc247}.dot.Error{background:#ff6868;color:#ff6868}.dot.Done{background:#47d68a;color:#47d68a}.dot.Idle{background:#7d828c;color:#7d828c}
.request .dot{animation:pulse 1.15s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.45);opacity:.62}}
.label{min-width:0;font-size:11px;font-weight:650;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.subtle{min-width:0;color:rgba(255,255,255,.58);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:620;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.panel{height:calc(100vh - 48px);padding:9px 15px 16px;overflow-y:auto;opacity:0;transform:scale(.94) translateY(-8px);transition:opacity .22s ease,transform .34s cubic-bezier(.22,1,.36,1)}
.expanded .panel{opacity:1;transform:scale(1) translateY(0)}
.panel::-webkit-scrollbar{width:0}
.section-title{margin:7px 2px 8px;color:rgba(255,255,255,.42);font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.9px}
.card,.row,.detail{width:100%;border:0;border-radius:12px;background:rgba(255,255,255,.075);color:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.055)}
.card{margin-bottom:10px;padding:12px;background:linear-gradient(180deg,rgba(255,194,71,.14),rgba(255,255,255,.07))}
.permission-title{display:flex;gap:8px;align-items:center;font-size:13px;font-weight:720}.permission-body{margin:8px 0 10px;color:rgba(255,255,255,.68);font-size:12px;line-height:17px}
.actions{display:flex;gap:7px;flex-wrap:wrap}.action{border:0;border-radius:999px;padding:6px 11px;background:rgba(255,255,255,.13);color:rgba(255,255,255,.92);font-size:12px;font-weight:650;cursor:pointer}.action:hover{background:rgba(255,255,255,.2)}
.row{margin-bottom:7px;padding:10px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;text-align:left;cursor:pointer}.row:hover{background:rgba(255,255,255,.105)}.row.selected{background:rgba(143,124,255,.24)}
.title{min-width:0}.primary{font-size:13px;font-weight:690;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.secondary{margin-top:1px;color:rgba(255,255,255,.54);font-size:11px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.progress{color:rgba(255,255,255,.6);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.detail{margin-top:10px;padding:11px}.detail-title{font-size:11px;color:rgba(255,255,255,.46);font-weight:750;text-transform:uppercase;letter-spacing:.8px}.detail-body{margin-top:6px;color:rgba(255,255,255,.72);font-size:12px;line-height:17px;max-height:68px;overflow:hidden}
.reply{margin-top:9px}.reply textarea{width:100%;min-height:58px;resize:none;border:1px solid rgba(255,255,255,.1);border-radius:12px;outline:0;padding:10px;background:rgba(0,0,0,.24);color:rgba(255,255,255,.92);font-size:12px;line-height:17px;user-select:text}.reply textarea:focus{border-color:rgba(143,124,255,.85)}
.empty{padding:36px 10px;color:rgba(255,255,255,.5);font-size:12px;text-align:center}
</style>
</head>
<body><main id="root" class="shell"></main><script>
const API="\(apiBase)";
const hardwareNotch=\(reservesHardwareNotch ? "true" : "false"),notchGap=\(notchGap);
let sessions=[],selectedConversationId="",expanded=false,lastError="",replyDraft="";
const root=document.getElementById("root");
root.style.setProperty("--notch-gap",notchGap+"px");
window.setHostExpanded=function(next){expanded=!!next;render();};
async function backend(path,opts){const r=await fetch(API+path,opts);if(!r.ok)throw new Error("HTTP "+r.status);if(r.status===204)return null;const text=await r.text();if(!text)return null;const json=JSON.parse(text);return json&&typeof json==="object"&&Object.prototype.hasOwnProperty.call(json,"data")?json.data:json;}
async function refresh(){try{const page=await backend("/api/conversations?limit=8");const conversations=arrayFromPage(page);const loaded=await Promise.all(conversations.map(loadSession));sessions=loaded.filter(Boolean).sort((a,b)=>(b.updated_at||0)-(a.updated_at||0));lastError="";if(!selectedConversationId&&sessions.length)selectedConversationId=id(sessions[0]);if(selectedConversationId&&!sessions.some(x=>id(x)===selectedConversationId))selectedConversationId=sessions[0]?id(sessions[0]):"";}catch(e){lastError=String(e)}if(!(document.activeElement instanceof HTMLTextAreaElement))render();}
async function loadSession(c){const cid=String(c.id||c.conversation_id||c.conversationId||"");if(!cid)return null;const [messagesPage,confirmationsPage]=await Promise.all([backend("/api/conversations/"+encodeURIComponent(cid)+"/messages?page=1&page_size=8&order=DESC").catch(()=>null),backend("/api/conversations/"+encodeURIComponent(cid)+"/confirmations").catch(()=>[])]);const messages=arrayFromPage(messagesPage);const confirmations=Array.isArray(confirmationsPage)?confirmationsPage:arrayFromPage(confirmationsPage);const modelMessage=messages.find(isModelMessage)||messages.find(m=>messageText(m))||null;const pending=confirmations.find(Boolean)||null;const state=sessionState(c,pending);return {conversationId:cid,session_id:cid,agent:c.type||c.agent||"AionUi",state,title:c.name||c.title||"AI conversation",currentStep:currentStep(c,pending,state),progress:progressFor(state),lastMessage:messageText(modelMessage),updated_at:Number(c.modified_at||c.updated_at||c.created_at||Date.now()),alive:state==="Working",pending_permission:pending?permissionFrom(pending,cid):null};}
function arrayFromPage(v){if(Array.isArray(v))return v;if(!v||typeof v!=="object")return[];if(Array.isArray(v.items))return v.items;if(Array.isArray(v.conversations))return v.conversations;if(Array.isArray(v.messages))return v.messages;if(Array.isArray(v.data))return v.data;return[];}
function sessionState(c,p){if(p)return"Waiting";const s=String(c.status||c.state||"").toLowerCase();if(s==="running"||s==="pending"||s==="working"||s==="processing")return"Working";if(s==="finished"||s==="done"||s==="completed")return"Done";return"Idle";}
function currentStep(c,p,state){if(p)return"Waiting for permission";if(state==="Working")return"Agent is working";if(state==="Done")return"Ready";return c.desc||c.workspace||c.type||"";}
function progressFor(state){if(state==="Waiting")return .2;if(state==="Working")return .62;if(state==="Done")return 1;return null;}
function permissionFrom(p,cid){const opts=Array.isArray(p.options)&&p.options.length?p.options:[{label:"Allow",value:"allow"},{label:"Deny",value:"deny"}];return {permissionId:p.id||p.permissionId||p.call_id,permission_id:p.id||p.permission_id||p.call_id,conversationId:cid,msgId:p.msg_id||p.msgId||p.message_id||p.id,callId:p.call_id||p.callId||p.id,header:p.title||p.action||"Permission requested",question:p.description||p.question||p.body||"AI is asking for permission.",body:p.description||p.body,options:opts.map(o=>({label:o.label||String(o.value),value:o.value!==undefined?o.value:o.label}))};}
setInterval(refresh,1000);refresh();
function render(){const top=sessions[0]||null,requests=sessions.filter(s=>s.pending_permission).length;root.className="shell"+(expanded?" expanded":"")+(requests?" request":"")+(hardwareNotch?" hardware-notch":"");root.innerHTML=`<div class="surface"><section class="compact"><div class="slot leading"><span class="dot ${status(top)}"></span><span class="label">${esc(compactLeft(top,requests))}</span></div><div class="center-gap"></div><div class="slot trailing"><span class="subtle">${esc(compactRight(requests))}</span></div></section>${expanded?panel():""}</div>`;}
function panel(){if(lastError)return `<section class="panel"><div class="empty">${esc(lastError)}</div></section>`;if(!sessions.length)return `<section class="panel"><div class="empty">No AI conversations yet</div></section>`;const perms=sessions.filter(s=>s.pending_permission).map(permission).join("");const rows=sessions.map(row).join("");const s=selected();return `<section class="panel">${perms}<div class="section-title">Conversations</div>${rows}${s?detail(s):""}${s?reply(s):""}</section>`;}
function permission(s){const p=s.pending_permission;if(!p)return"";const pid=p.permissionId||p.permission_id;const acts=(p.options||[]).map((o,i)=>`<button class="action" data-action="permission" data-permission-id="${attr(pid)}" data-option-index="${i}">${esc(o.label||String(o.value))}</button>`).join("");return `<article class="card"><div class="permission-title"><span class="dot Waiting"></span>${esc(p.header||"Permission requested")}</div><div class="permission-body">${esc(p.question||p.body||"AI is asking for permission.")}</div><div class="actions">${acts}</div></article>`;}
function row(s){const sid=id(s),sel=sid===selectedConversationId?" selected":"";return `<button class="row${sel}" data-action="select" data-conversation-id="${attr(sid)}"><span class="dot ${s.state}"></span><div class="title"><div class="primary">${esc(sessionTitle(s))}</div><div class="secondary">${esc(s.lastMessage||s.currentStep||s.agent||"")}</div></div><span class="progress">${esc(progress(s))}</span></button>`;}
function detail(s){return `<article class="detail"><div class="detail-title">Latest model message</div><div class="detail-body">${esc(s.lastMessage||s.currentStep||"No recent message.")}</div></article>`}
function reply(s){return `<form class="reply" data-action="reply"><textarea aria-label="Reply" placeholder="Reply to ${attr(sessionTitle(s))}...">${esc(replyDraft)}</textarea></form>`;}
root.addEventListener("click",e=>{const el=e.target.closest("[data-action]");if(!el)return;e.stopPropagation();const a=el.dataset.action;if(a==="select"){selectedConversationId=el.dataset.conversationId||"";render();return}if(a==="permission")resolvePermission(el);});
root.addEventListener("input",e=>{if(e.target instanceof HTMLTextAreaElement)replyDraft=e.target.value;});
root.addEventListener("keydown",e=>{if(!(e.target instanceof HTMLTextAreaElement)||e.key!=="Enter"||e.shiftKey)return;e.preventDefault();sendReply(e.target.closest("form"));});
root.addEventListener("submit",e=>{e.preventDefault();sendReply(e.target);});
async function resolvePermission(el){const pid=el.dataset.permissionId||"",idx=Number(el.dataset.optionIndex||0);const owner=sessions.find(s=>s.pending_permission&&(s.pending_permission.permissionId===pid||s.pending_permission.permission_id===pid));const p=owner&&owner.pending_permission;if(!owner||!p)return;const o=p.options?p.options[idx]:null;await backend("/api/conversations/"+encodeURIComponent(id(owner))+"/confirmations/"+encodeURIComponent(p.callId||pid)+"/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({msg_id:p.msgId||pid,data:o?(o.value??o.label):"allow",always_allow:false})});refresh();}
async function sendReply(form){const ta=form&&form.querySelector("textarea"),text=(ta&&ta.value||"").trim(),s=selected();if(!s||!text)return;ta.value="";replyDraft="";await backend("/api/conversations/"+encodeURIComponent(id(s))+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:text,files:[]})});refresh();}
function selected(){return sessions.find(s=>id(s)===selectedConversationId)||sessions[0]||null}function id(s){return s.conversationId||s.session_id}function sessionTitle(s){return s.title||s.currentStep||s.agent||id(s)||"AI task"}function status(s){if(lastError)return"Error";if(!s)return"Idle";if(s.pending_permission)return"Waiting";return s.state}function compactLeft(s,requests){if(lastError)return"Offline";if(requests)return requests+" permission request"+(requests>1?"s":"");if(!s)return"AionUi";return s.state==="Working"?"Working: "+sessionTitle(s):sessionTitle(s)}function compactRight(requests){if(requests)return"ASK";const w=sessions.filter(s=>s.state==="Working").length;if(w)return w+" RUN";return sessions.length?sessions.length+" AI":"AI"}function progress(s){return typeof s.progress==="number"?Math.round(s.progress*100)+"%":(s.alive?s.state:"Idle")}function isModelMessage(m){if(!m)return false;const role=String(m.role||m.sender||m.author||"").toLowerCase();const type=String(m.type||"").toLowerCase();if(role.includes("user")||type==="user"||type==="input")return false;return !!messageText(m);}function messageText(m){if(!m)return"";const c=m.content!==undefined?m.content:(m.text!==undefined?m.text:(m.message!==undefined?m.message:m.data));const raw=textFrom(c)||m.title||m.description||"";return String(raw).replace(/\\s+/g," ").trim().slice(0,500)}function textFrom(v){if(v==null)return"";if(typeof v==="string")return v;if(typeof v==="number"||typeof v==="boolean")return String(v);if(Array.isArray(v))return v.map(textFrom).filter(Boolean).join(" ");if(typeof v==="object")return textFrom(v.text||v.content||v.message||v.description||v.title||v.value||"");return"";}function esc(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}function attr(v){return esc(v)}
</script></body></html>
"""
    }
}

var api = "http://127.0.0.1:25809"
if let index = CommandLine.arguments.firstIndex(of: "--api"), CommandLine.arguments.count > index + 1 {
    api = CommandLine.arguments[index + 1]
}
let reservesHardwareNotch = CommandLine.arguments.contains("--hardware-notch")
var parentPID: pid_t?
if let index = CommandLine.arguments.firstIndex(of: "--parent-pid"), CommandLine.arguments.count > index + 1 {
    parentPID = pid_t(CommandLine.arguments[index + 1])
}

guard let apiURL = URL(string: api) else {
    fatalError("Invalid --api URL")
}

let app = NSApplication.shared
let delegate = AppDelegate(apiURL: apiURL, reservesHardwareNotch: reservesHardwareNotch, parentPID: parentPID)
app.delegate = delegate
app.run()
