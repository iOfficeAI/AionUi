/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThemedLogo, {
  detectTintableLogo,
  isTintableLogoCandidate,
  ProviderLogo,
} from '@/renderer/components/agent/ThemedLogo';

vi.mock('@icon-park/react', () => ({
  LinkCloud: ({ className }: { className?: string }) => (
    <span data-testid='link-cloud-fallback' className={className} />
  ),
}));

/**
 * The module keeps a per-URL detection cache for the whole session, so each
 * test uses a unique URL instead of resetting modules (which would fork React).
 */
let urlSeq = 0;
const uniqueSvgUrl = () => `http://127.0.0.1:1/api/assets/logos/test-${++urlSeq}.svg`;

const svgResponse = (body: string, ok = true) => ({ ok, text: () => Promise.resolve(body) }) as unknown as Response;

const stubFetch = (impl: (url: string) => Promise<Response>) => {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const flushDetection = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isTintableLogoCandidate', () => {
  it('accepts served svg urls, including ones with query strings', () => {
    expect(isTintableLogoCandidate('http://127.0.0.1:1/api/assets/logos/openai.svg')).toBe(true);
    expect(isTintableLogoCandidate('/api/assets/logos/openai.svg?v=2')).toBe(true);
  });

  it('rejects empty, inline and non-svg sources', () => {
    expect(isTintableLogoCandidate(undefined)).toBe(false);
    expect(isTintableLogoCandidate('data:image/svg+xml,<svg fill="currentColor"/>')).toBe(false);
    expect(isTintableLogoCandidate('http://127.0.0.1:1/api/assets/logos/minimax.png')).toBe(false);
  });
});

describe('detectTintableLogo', () => {
  it('resolves true for an svg that declares currentColor', async () => {
    stubFetch(() => Promise.resolve(svgResponse('<svg fill="currentColor"></svg>')));
    await expect(detectTintableLogo(uniqueSvgUrl())).resolves.toBe(true);
  });

  it('resolves false when the request fails instead of throwing', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));
    await expect(detectTintableLogo(uniqueSvgUrl())).resolves.toBe(false);
  });

  it('resolves false on a non-ok response', async () => {
    stubFetch(() => Promise.resolve(svgResponse('<svg fill="currentColor"></svg>', false)));
    await expect(detectTintableLogo(uniqueSvgUrl())).resolves.toBe(false);
  });

  it('fetches each url once and serves later calls from the cache', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(svgResponse('<svg fill="currentColor"></svg>')));
    const url = uniqueSvgUrl();
    const [first, second] = await Promise.all([detectTintableLogo(url), detectTintableLogo(url)]);
    await expect(detectTintableLogo(url)).resolves.toBe(true);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ThemedLogo', () => {
  it('re-renders a currentColor svg as a tinted mask with the accessible name', async () => {
    stubFetch(() => Promise.resolve(svgResponse('<svg fill="currentColor"></svg>')));
    const { container } = render(<ThemedLogo src={uniqueSvgUrl()} alt='OpenAI logo' />);

    await flushDetection();

    const mask = screen.getByRole('img', { name: 'OpenAI logo' });
    expect(mask.tagName).toBe('SPAN');
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps a color svg rendered as a plain img', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(svgResponse('<svg fill="#D97757"></svg>')));
    const { container } = render(<ThemedLogo src={uniqueSvgUrl()} alt='Claude logo' />);

    await flushDetection();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('Claude logo');
  });

  it('renders non-svg sources as plain img without inspecting them', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(svgResponse('')));
    const { container } = render(<ThemedLogo src='http://127.0.0.1:1/api/assets/logos/minimax.png' alt='MiniMax' />);

    await flushDetection();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('falls back to plain img rendering when detection fails', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));
    const { container } = render(<ThemedLogo src={uniqueSvgUrl()} alt='Offline logo' />);

    await flushDetection();

    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('span[role="img"]')).toBeNull();
  });

  it('renders the fallback node when src is empty', () => {
    render(<ThemedLogo src={null} alt='none' fallback={<span data-testid='logo-fallback' />} />);
    expect(screen.getByTestId('logo-fallback')).toBeInTheDocument();
  });

  it('stays hidden during detection to avoid first-paint black flash', () => {
    // No fetch stub → detection never resolves → stays pending forever
    const { container } = render(<ThemedLogo src={uniqueSvgUrl()} alt='Loading' />);

    const span = container.querySelector('span[aria-hidden="true"]');
    expect(span).not.toBeNull();
    expect(span!.style.visibility).toBe('hidden');
    expect(container.querySelector('img')).toBeNull();
  });

  it('hides decorative tinted logos from assistive technology', async () => {
    stubFetch(() => Promise.resolve(svgResponse('<svg fill="currentColor"></svg>')));
    const { container } = render(<ThemedLogo src={uniqueSvgUrl()} alt='' />);

    await flushDetection();

    const mask = container.querySelector('span[aria-hidden="true"]');
    expect(mask).not.toBeNull();
    expect(mask?.getAttribute('role')).toBeNull();
  });

  it('passes the title attribute through on the mask span', async () => {
    stubFetch(() => Promise.resolve(svgResponse('<svg fill="currentColor"></svg>')));
    const { container } = render(<ThemedLogo src={uniqueSvgUrl()} alt='OpenAI' title='OpenAI Logo' />);
    await flushDetection();
    const mask = container.querySelector('span[role="img"]');
    expect(mask?.getAttribute('title')).toBe('OpenAI Logo');
  });
});

describe('ProviderLogo', () => {
  it('renders the shared cloud fallback when the platform has no logo', () => {
    render(<ProviderLogo logo={null} name='Custom' />);
    expect(screen.getByTestId('link-cloud-fallback')).toBeInTheDocument();
  });

  it('renders the platform logo image when provided', async () => {
    stubFetch(() => Promise.resolve(svgResponse('<svg fill="#3186FF"></svg>')));
    const { container } = render(<ProviderLogo logo={uniqueSvgUrl()} name='Gemini' size={18} />);

    await flushDetection();

    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('Gemini');
    expect(img?.style.width).toBe('18px');
  });
});
