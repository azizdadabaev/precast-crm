import { describe, it, expect } from 'vitest';
import { classifyInboundMedia } from './media-allowlist';

describe('classifyInboundMedia', () => {
  it('passes plain text / contact / location / sticker (no media to fetch)', () => {
    expect(classifyInboundMedia({ kind: 'text' })).toEqual({ action: 'pass' });
    expect(classifyInboundMedia({ kind: 'contact' })).toEqual({ action: 'pass' });
    expect(classifyInboundMedia({ kind: 'location' })).toEqual({ action: 'pass' });
    expect(classifyInboundMedia({ kind: 'sticker' })).toEqual({ action: 'pass' });
  });

  it('processes a photo as an image', () => {
    expect(classifyInboundMedia({ kind: 'photo' })).toEqual({ action: 'process', as: 'image' });
  });

  it('transcribes a voice note', () => {
    expect(classifyInboundMedia({ kind: 'voice' })).toEqual({ action: 'transcribe' });
  });

  it('hands video / video_note / animation / music-audio to a human (never processed)', () => {
    for (const kind of ['video', 'video_note', 'animation', 'audio'] as const) {
      const d = classifyInboundMedia({ kind });
      expect(d.action).toBe('escalate');
    }
  });

  it('processes a real PDF document (mime AND extension agree)', () => {
    expect(
      classifyInboundMedia({ kind: 'document', mimeType: 'application/pdf', fileName: 'plan.pdf' }),
    ).toEqual({ action: 'process', as: 'pdf' });
  });

  it('processes an image sent as a document (mime AND extension agree)', () => {
    expect(
      classifyInboundMedia({ kind: 'document', mimeType: 'image/png', fileName: 'room.png' }),
    ).toEqual({ action: 'process', as: 'image' });
  });

  it('REJECTS an .apk document (never downloaded/opened)', () => {
    const d = classifyInboundMedia({
      kind: 'document',
      mimeType: 'application/vnd.android.package-archive',
      fileName: 'invoice.apk',
    });
    expect(d.action).toBe('reject');
  });

  it('REJECTS a mime/extension mismatch (e.g. .apk disguised as application/pdf)', () => {
    const d = classifyInboundMedia({ kind: 'document', mimeType: 'application/pdf', fileName: 'photo.apk' });
    expect(d.action).toBe('reject');
  });

  it('REJECTS unknown/other document types (zip, exe, office docs)', () => {
    expect(classifyInboundMedia({ kind: 'document', mimeType: 'application/zip', fileName: 'a.zip' }).action).toBe('reject');
    expect(classifyInboundMedia({ kind: 'document', mimeType: 'application/octet-stream', fileName: 'a.exe' }).action).toBe('reject');
    expect(classifyInboundMedia({ kind: 'document', mimeType: 'application/msword', fileName: 'a.doc' }).action).toBe('reject');
  });

  it('escalates oversize images/pdf/voice instead of processing', () => {
    expect(classifyInboundMedia({ kind: 'photo', fileSize: 20_000_000 }).action).toBe('escalate');
    expect(
      classifyInboundMedia({ kind: 'document', mimeType: 'application/pdf', fileName: 'big.pdf', fileSize: 50_000_000 }).action,
    ).toBe('escalate');
    expect(classifyInboundMedia({ kind: 'voice', fileSize: 50_000_000 }).action).toBe('escalate');
  });

  it('normalises uppercase extensions (e.g. ROOM.PNG from Android)', () => {
    expect(
      classifyInboundMedia({ kind: 'document', mimeType: 'image/png', fileName: 'ROOM.PNG' }),
    ).toEqual({ action: 'process', as: 'image' });
  });

  it('REJECTS a document missing fileName (no extension to verify)', () => {
    expect(
      classifyInboundMedia({ kind: 'document', mimeType: 'application/pdf' }).action,
    ).toBe('reject');
  });
});
