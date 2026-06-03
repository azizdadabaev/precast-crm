import { describe, it, expect } from "vitest";
import { parseBusinessUpdate, classifyMedia } from "../src/lib/telegram/parse";

const base = {
  message_id: 42,
  business_connection_id: "bizconn1",
  from: { id: 555, first_name: "Алишер", last_name: "У", username: "alisher_t" },
  chat: { id: 555 },
  date: 1717200000,
};

describe("classifyMedia", () => {
  it("returns null for a text-only message", () => {
    expect(classifyMedia({ ...base, text: "narxi qancha?" })).toBeNull();
  });
  it("picks the largest photo size as IMAGE", () => {
    const m = classifyMedia({
      ...base,
      photo: [
        { file_id: "small", file_size: 100, width: 90, height: 90 },
        { file_id: "big", file_size: 9000, width: 1280, height: 1280 },
      ],
    });
    expect(m).toMatchObject({ kind: "IMAGE", fileId: "big", fileSize: 9000 });
  });
  it("classifies voice with duration meta", () => {
    const m = classifyMedia({ ...base, voice: { file_id: "v1", duration: 7, file_size: 5000, mime_type: "audio/ogg" } });
    expect(m).toMatchObject({ kind: "VOICE", fileId: "v1", fileSize: 5000, meta: { duration: 7 } });
  });
  it("classifies round video_note", () => {
    const m = classifyMedia({ ...base, video_note: { file_id: "vn1", duration: 5, length: 240, file_size: 8000 } });
    expect(m).toMatchObject({ kind: "VIDEO_NOTE", fileId: "vn1" });
  });
  it("classifies file video", () => {
    const m = classifyMedia({ ...base, video: { file_id: "vid1", duration: 12, file_size: 999999 } });
    expect(m).toMatchObject({ kind: "VIDEO", fileId: "vid1" });
  });
  it("classifies audio with title", () => {
    const m = classifyMedia({ ...base, audio: { file_id: "a1", title: "song", file_size: 4000 } });
    expect(m).toMatchObject({ kind: "AUDIO", fileId: "a1", meta: { title: "song" } });
  });
  it("classifies a document with filename", () => {
    const m = classifyMedia({ ...base, document: { file_id: "d1", file_name: "drawing.pdf", mime_type: "application/pdf", file_size: 240000 } });
    expect(m).toMatchObject({ kind: "DOCUMENT", fileId: "d1", fileName: "drawing.pdf", fileSize: 240000 });
  });
  it("classifies a bare location with lat/lng meta and NO fileId", () => {
    const m = classifyMedia({ ...base, location: { latitude: 41.31, longitude: 69.28 } });
    expect(m).toMatchObject({ kind: "LOCATION", meta: { lat: 41.31, lng: 69.28 } });
    expect(m?.fileId).toBeUndefined();
  });
  it("classifies a venue with title/address", () => {
    const m = classifyMedia({ ...base, venue: { location: { latitude: 41.31, longitude: 69.28 }, title: "Office", address: "Yunusobod" } });
    expect(m).toMatchObject({ kind: "LOCATION", meta: { lat: 41.31, lng: 69.28, title: "Office", address: "Yunusobod" } });
  });
  it("classifies an unsupported type (sticker) as OTHER", () => {
    const m = classifyMedia({ ...base, sticker: { file_id: "s1" } });
    expect(m).toMatchObject({ kind: "OTHER" });
  });
  it("classifies a shared contact as OTHER (display unchanged; phone captured separately)", () => {
    const m = classifyMedia({ ...base, contact: { phone_number: "+998901234567", first_name: "Ali" } });
    expect(m).toMatchObject({ kind: "OTHER" });
  });
});

describe("parseBusinessUpdate", () => {
  it("returns null when there is no business_message", () => {
    expect(parseBusinessUpdate({ update_id: 1 })).toBeNull();
  });
  it("parses a text business_message", () => {
    const p = parseBusinessUpdate({ update_id: 1, business_message: { ...base, text: "salom" } });
    expect(p).toMatchObject({
      businessConnectionId: "bizconn1",
      chatId: "555",
      telegramMsgId: "42",
      displayName: "Алишер У",
      username: "alisher_t",
      text: "salom",
      media: null,
      isEdited: false,
    });
    // from.id === chat.id → customer message → not outgoing
    expect(p?.outgoing).toBe(false);
  });
  it("marks outgoing=true when from.id differs from chat.id (owner's phone message)", () => {
    // Owner (id 999) sends from their phone into chat with customer (id 555)
    const ownerMsg = {
      ...base,
      from: { id: 999, first_name: "Owner", username: "owner_handle" },
      chat: { id: 555 },
      text: "On my way",
    };
    const p = parseBusinessUpdate({ update_id: 2, business_message: ownerMsg });
    expect(p?.outgoing).toBe(true);
    expect(p?.chatId).toBe("555");
  });
  it("uses caption as text when media has a caption", () => {
    const p = parseBusinessUpdate({
      update_id: 1,
      business_message: { ...base, caption: "mana chizma", document: { file_id: "d1", file_name: "a.pdf", file_size: 10 } },
    });
    expect(p?.text).toBe("mana chizma");
    expect(p?.media).toMatchObject({ kind: "DOCUMENT" });
  });
  it("flags edited_business_message with isEdited true", () => {
    const p = parseBusinessUpdate({ update_id: 1, edited_business_message: { ...base, text: "tuzatildi" } });
    expect(p).toMatchObject({ isEdited: true, text: "tuzatildi" });
  });
  it("falls back to first_name only when last_name is absent", () => {
    const p = parseBusinessUpdate({ update_id: 1, business_message: { ...base, from: { id: 9, first_name: "Бобур" }, text: "hi" } });
    expect(p?.displayName).toBe("Бобур");
    expect(p?.username).toBeNull();
  });
  it("parses media_group_id into mediaGroupId", () => {
    const p = parseBusinessUpdate({
      update_id: 1,
      business_message: {
        ...base,
        media_group_id: "album-abc-123",
        photo: [
          { file_id: "small", file_size: 100, width: 90, height: 90 },
          { file_id: "big", file_size: 9000, width: 1280, height: 1280 },
        ],
      },
    });
    expect(p?.mediaGroupId).toBe("album-abc-123");
    expect(p?.media).toMatchObject({ kind: "IMAGE" });
  });
  it("yields null mediaGroupId when media_group_id is absent", () => {
    const p = parseBusinessUpdate({ update_id: 1, business_message: { ...base, text: "plain text" } });
    expect(p?.mediaGroupId).toBeNull();
  });
  it("extracts a digits-only phone + name from a shared contact", () => {
    const p = parseBusinessUpdate({
      update_id: 1,
      business_message: { ...base, contact: { phone_number: "+998 (90) 123-45-67", first_name: "Ali", last_name: "V" } },
    });
    expect(p?.contact).toEqual({ phone: "998901234567", name: "Ali V" });
  });
  it("leaves contact undefined when no contact is shared", () => {
    const p = parseBusinessUpdate({ update_id: 1, business_message: { ...base, text: "hi" } });
    expect(p?.contact).toBeUndefined();
  });
});
