import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SendBusinessReplyResult } from "@/lib/inbox-send";
import type { HandoffPresetConfig } from "@/lib/handoff-presets";

// Only the config LOAD is mocked (it hits Prisma); configuredPresets /
// isPresetConfigured stay real, because "is this preset actually deliverable"
// is exactly the behaviour under test.
const loadHandoffPresets = vi.fn<() => Promise<HandoffPresetConfig>>();
vi.mock("@/lib/handoff-presets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/handoff-presets")>(
    "@/lib/handoff-presets",
  );
  return { ...actual, loadHandoffPresets: () => loadHandoffPresets() };
});

const sendBusinessLocation = vi.fn<(i: unknown) => Promise<SendBusinessReplyResult>>();
const sendBusinessProofMedia = vi.fn<(i: unknown) => Promise<SendBusinessReplyResult>>();
const sendBusinessDocument = vi.fn<(i: unknown) => Promise<SendBusinessReplyResult>>();
vi.mock("@/lib/inbox-send", () => ({
  sendBusinessLocation: (i: unknown) => sendBusinessLocation(i),
  sendBusinessProofMedia: (i: unknown) => sendBusinessProofMedia(i),
  sendBusinessDocument: (i: unknown) => sendBusinessDocument(i),
}));

import { dispatchHandoffPresets } from "./handoff-dispatch";

const OK: SendBusinessReplyResult = {
  ok: true,
  message: { id: "m1", direction: "OUTBOUND", text: null, failed: false, createdAt: new Date(0) },
};

const FULL_CONFIG: HandoffPresetConfig = {
  LOCATION: { lat: 40.9983, lng: 71.6726, caption: "Завод" },
  PHOTOS: { fileIds: ["ph1", "ph2"], caption: "Маҳсулот расмлари" },
  VIDEOS: { fileIds: ["vd1"], caption: "Монтаж видео" },
  PRICELIST: { fileId: "doc1", caption: "Нарх рўйхати" },
};

/** Preset name per call, in the order the sends actually happened. */
function callOrder(): string[] {
  const calls: { seq: number; preset: string }[] = [];
  for (const c of sendBusinessLocation.mock.invocationCallOrder.entries()) {
    calls.push({ seq: c[1], preset: "LOCATION" });
  }
  for (const [i, seq] of sendBusinessProofMedia.mock.invocationCallOrder.entries()) {
    const arg = sendBusinessProofMedia.mock.calls[i][0] as { kind: string };
    calls.push({ seq, preset: arg.kind === "PHOTO" ? "PHOTOS" : "VIDEOS" });
  }
  for (const c of sendBusinessDocument.mock.invocationCallOrder.entries()) {
    calls.push({ seq: c[1], preset: "PRICELIST" });
  }
  return calls.sort((a, b) => a.seq - b.seq).map((c) => c.preset);
}

const dispatch = (presets: string[]) =>
  dispatchHandoffPresets({ conversationId: "conv1", presets, userId: null });

describe("dispatchHandoffPresets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadHandoffPresets.mockResolvedValue(FULL_CONFIG);
    sendBusinessLocation.mockResolvedValue(OK);
    sendBusinessProofMedia.mockResolvedValue(OK);
    sendBusinessDocument.mockResolvedValue(OK);
  });

  it("sends in the fixed LOCATION → PHOTOS → VIDEOS → PRICELIST order", async () => {
    // Requested in a deliberately scrambled order.
    const res = await dispatch(["PRICELIST", "VIDEOS", "LOCATION", "PHOTOS"]);
    expect(callOrder()).toEqual(["LOCATION", "PHOTOS", "PHOTOS", "VIDEOS", "PRICELIST"]);
    expect(res.sent).toEqual(["LOCATION", "PHOTOS", "VIDEOS", "PRICELIST"]);
    expect(res.skipped).toEqual([]);
    expect(res.failed).toEqual([]);
  });

  it("passes the configured coordinates and file ids through unchanged", async () => {
    await dispatch(["LOCATION", "PRICELIST"]);
    expect(sendBusinessLocation).toHaveBeenCalledWith({
      conversationId: "conv1",
      latitude: 40.9983,
      longitude: 71.6726,
      userId: null,
    });
    expect(sendBusinessDocument).toHaveBeenCalledWith({
      conversationId: "conv1",
      fileId: "doc1",
      caption: "Нарх рўйхати",
      userId: null,
    });
  });

  it("captions only the first item of a multi-file preset", async () => {
    await dispatch(["PHOTOS"]);
    const captions = sendBusinessProofMedia.mock.calls.map(
      (c) => (c[0] as { caption: string | null }).caption,
    );
    expect(captions).toEqual(["Маҳсулот расмлари", null]);
  });

  it("skips presets the owner has not configured — never invents a pin or a file id", async () => {
    loadHandoffPresets.mockResolvedValue({ LOCATION: { lat: 41, lng: 69 } });
    const res = await dispatch(["LOCATION", "VIDEOS", "PRICELIST"]);
    expect(res.sent).toEqual(["LOCATION"]);
    expect(res.skipped).toEqual(["VIDEOS", "PRICELIST"]);
    expect(res.failed).toEqual([]);
    expect(sendBusinessProofMedia).not.toHaveBeenCalled();
    expect(sendBusinessDocument).not.toHaveBeenCalled();
  });

  it("skips an unknown preset name instead of throwing", async () => {
    const res = await dispatch(["LOCATION", "COFFEE"]);
    expect(res.sent).toEqual(["LOCATION"]);
    expect(res.skipped).toEqual(["COFFEE"]);
  });

  it("a preset with an empty fileIds array is not deliverable", async () => {
    loadHandoffPresets.mockResolvedValue({ PHOTOS: { fileIds: [] } });
    const res = await dispatch(["PHOTOS"]);
    expect(res.sent).toEqual([]);
    expect(res.skipped).toEqual(["PHOTOS"]);
  });

  it("one failing preset does not stop the rest", async () => {
    sendBusinessLocation.mockResolvedValue({ ok: false, reason: "SEND_FAILED" });
    const res = await dispatch(["LOCATION", "PHOTOS", "VIDEOS", "PRICELIST"]);
    expect(res.failed).toEqual([{ preset: "LOCATION", reason: "SEND_FAILED" }]);
    expect(res.sent).toEqual(["PHOTOS", "VIDEOS", "PRICELIST"]);
    expect(sendBusinessDocument).toHaveBeenCalledTimes(1);
  });

  it("a THROWN send error is contained — later presets still go out", async () => {
    sendBusinessProofMedia.mockRejectedValue(new Error("socket hang up"));
    const res = await dispatch(["LOCATION", "PHOTOS", "PRICELIST"]);
    expect(res.sent).toEqual(["LOCATION", "PRICELIST"]);
    expect(res.failed).toEqual([
      { preset: "PHOTOS", reason: "socket hang up, socket hang up" },
    ]);
  });

  it("a partly-delivered multi-file preset is reported as failed, not sent", async () => {
    sendBusinessProofMedia
      .mockResolvedValueOnce(OK)
      .mockResolvedValueOnce({ ok: false, reason: "SEND_FAILED" });
    const res = await dispatch(["PHOTOS"]);
    expect(res.sent).toEqual([]);
    expect(res.failed).toEqual([{ preset: "PHOTOS", reason: "SEND_FAILED" }]);
  });

  it("duplicate requests are dispatched once", async () => {
    const res = await dispatch(["LOCATION", "LOCATION"]);
    expect(sendBusinessLocation).toHaveBeenCalledTimes(1);
    expect(res.sent).toEqual(["LOCATION"]);
  });

  it("an unreadable config fails every preset instead of throwing", async () => {
    loadHandoffPresets.mockRejectedValue(new Error("db down"));
    const res = await dispatch(["LOCATION", "PHOTOS"]);
    expect(res.sent).toEqual([]);
    expect(res.failed).toEqual([
      { preset: "LOCATION", reason: "CONFIG_UNAVAILABLE" },
      { preset: "PHOTOS", reason: "CONFIG_UNAVAILABLE" },
    ]);
    expect(sendBusinessLocation).not.toHaveBeenCalled();
  });

  it("an empty preset list is a no-op", async () => {
    const res = await dispatch([]);
    expect(res).toEqual({ sent: [], skipped: [], failed: [] });
    expect(sendBusinessLocation).not.toHaveBeenCalled();
  });
});
