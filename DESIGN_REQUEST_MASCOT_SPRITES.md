# Design Request — Mascot Foyer Demo (sprite sheet đầy đủ mặt)

**Người nhận:** ChatGPT / Gemini (hoặc model sinh ảnh img2img / edit)  
**Mục đích:** Từ **1 ảnh PNG gốc đã có**, tạo **5 animation sprite sheet** (mỗi motion một sheet, **12–16 frame** để chạy mượt).  
**Không làm:** thiết kế nhân vật mới, tách layer mắt/mũi/miệng, xuất từng frame lẻ, gộp mọi motion vào 1 sheet.

---

## 0. ẢNH GỐC BẮT BUỘC (character lock)

File tham chiếu trong repo:

`public/mascot/reference/character_base.png`

User **phải đính kèm đúng ảnh này** mỗi lần chat / mỗi lần generate.  
Mọi prompt là **chỉnh sửa trên ảnh này** (image-to-image / edit), **không** text-to-image từ zero.

### CHARACTER_LOCK (khóa — copy nguyên văn vào mọi prompt)

```text
Exact same character as the attached reference PNG: white round chibi head, long floppy white ears hanging down both sides, tiny vertical black oval eyes, soft pink oval blush under each eye, no nose, stubby white limbs, taupe/brown open coat, black-and-white checkered scarf with one end hanging down the front; thick clean black outlines; flat colors; same proportions and costume. Do not redesign.
```

### CẤM tuyệt đối
- Tạo nhân vật mới / “inspired by” / đổi tai, mắt, khăn, áo, tỷ lệ
- Đổi style (3D, watercolor, anime chi tiết…)
- Giữ background rooftop/city / caro từ ảnh gốc (output phải **phông xanh chroma key**)
- Nền trong suốt / checkerboard giả — model gen kém; **bắt buộc nền xanh đặc**
- Tách riêng file mắt / mũi / miệng / body overlay
- Một prompt làm hết 5 motion
- Sheet chỉ 4 frame (quá giật) — tối thiểu **12**, khuyến nghị **16**

### Workflow bắt buộc
1. Attach `character_base.png`
2. Chạy **đúng 1 prompt** cho **đúng 1** sheet (`PROMPT_ID`)
3. Strength/edit thấp–trung bình để giữ nét gốc
4. Lặp cho sheet tiếp theo — vẫn attach ảnh gốc

---

## 1. Bối cảnh sản phẩm

Demo mascot sảnh: đổi **motion clip** theo trạng thái (idle / thinking / chào / vui / special).  

Engine **cắt ô từ sprite sheet** rồi play tuần tự — **không** ghép layer mặt riêng.  
→ Mỗi frame phải là **nhân vật đầy đủ**: thân + mặt (mắt, má hồng như reference). Có thể thêm miệng tối giản vẽ sẵn trên frame nếu motion cần biểu cảm; **không** giao file mouth/eyes tách.

---

## 2. Spec kỹ thuật

| Hạng mục | Yêu cầu |
|---|---|
| Nguồn | Chỉ `character_base.png`. Không invent character |
| Phong cách | Flat, viền đen dày đều, màu đặc, chibi — khớp reference |
| Góc nhìn | Mặt trước như ảnh gốc — khóa cho cả bộ |
| Mặt trong frame | **Giữ mắt + má hồng** như reference; không bỏ mắt để “chờ overlay” |
| Nền | **Phông xanh chroma key** đặc, đều — hex **`#00FF00`** (RGB 0,255,0). Không gradient, không bóng xanh lên nhân vật |
| Cell | **512 × 512** px mỗi frame (thống nhất cả bộ) |
| Cấm | Transparent/alpha, caro giả, rooftop/sky, text, watermark, số frame, UI |
| Hậu kỳ | Team sẽ key xanh → transparent; nhân vật **không** được dùng màu xanh lá gần `#00FF00` |

---

## 3. Deliverables — chỉ sprite sheet (12–16 frame / motion)

### 3A. Quy ước sheet (bắt buộc)

| Hạng mục | Chốt |
|---|---|
| Frame / motion | **16 frame** (khuyến nghị) hoặc **12 frame** (tối thiểu) |
| Grid 16 frame | **4 cột × 4 hàng** → sheet **2048 × 2048** |
| Grid 12 frame | **4 cột × 3 hàng** → sheet **2048 × 1536** |
| Thứ tự đọc | Trái → phải, trên → dưới (frame 01 ở trên-trái) |
| Nền ô | Phông xanh `#00FF00` đặc kín ô (kể cả khe giữa nhân vật nếu có); không caption, không số |
| Nhân vật trong ô | Cùng scale, cùng baseline chân; mặt đầy đủ; **không** spill xanh lên viền |
| Số file | **5 sheet = 5 motion** — mỗi motion 1 PNG + 1 prompt |

| Tag | Tên file | Diễn xuất | Loop? | Frame |
|---|---|---|---|---|
| `idle` | `clips/idle_sheet.png` | Thở / nhún nhẹ, mượt | Có | 12–16 |
| `thinking` | `clips/thinking_sheet.png` | Nghiêng đầu / tay gần mặt | Có | 12–16 |
| `wave_hello` | `clips/wave_hello_sheet.png` | Vẫy tay chào | Có | 12–16 |
| `happy` | `clips/happy_sheet.png` | Nhún vui | Có | 12–16 |
| `special` | `clips/special_sheet.png` | Nhảy nhẹ / pose nổi | 1 chu kỳ | 12–16 |

**CẤM:** một sheet chứa hết 5 motion.  
**CẤM:** sheet 4 frame.  
**CHO PHÉP:** mỗi sheet = đúng 1 motion, 12 hoặc 16 frame (ghi rõ trong prompt).

### 3B. Meta (bắt buộc ghi kèm)

```json
{
  "cell": { "width": 512, "height": 512 },
  "columns": 4,
  "rows": 4,
  "frameCount": 16,
  "frameMs": 50,
  "order": "left-to-right, top-to-bottom",
  "chromaKey": "#00FF00",
  "notes": "rows=3 và frameCount=12 nếu chọn bản 12 frame. Nền xanh để key; không mouth/eyes layer."
}
```

Gợi ý `frameMs`: ~50ms @ 16 frame ≈ 0.8s/chu kỳ; ~60–70ms @ 12 frame. Có thể chỉnh sau khi play.

---

## 4. Pass / fail

**Pass khi:**
- Đúng character gốc (khăn caro, áo taupe, mắt oval, má hồng)
- Mỗi sheet 1 motion, grid đều, **12 hoặc 16** frame
- Nền **xanh `#00FF00` đặc đều**, không số/caption
- Key xanh ra được sạch (viền nhân vật không dính xanh mạnh)
- Motion đọc mượt khi loop (idle/thinking/happy)

**Fail khi:**
- Nền transparent / trắng / caro / rooftop thay vì phông xanh
- Tách layer mắt/mũi/miệng
- Sheet chỉ 4–8 frame
- Gộp nhiều motion trên 1 sheet
- Lệch scale/baseline giữa các ô
- Redesign nhân vật / còn background ảnh gốc

---

## 5. Quy tắc prompt

- **1 motion = 1 sprite sheet = 1 prompt**
- Tổng **5 prompt** (không còn prompt body/mouth/eyes)
- CẤM 1 prompt làm cả 5 sheet

---

## 6. Danh sách prompt (tổng 5)

| # | PROMPT_ID | Loại |
|---|---|---|
| 1 | `clips/idle_sheet.png` | sheet 4×4 (16) hoặc 4×3 (12) |
| 2 | `clips/thinking_sheet.png` | sheet |
| 3 | `clips/wave_hello_sheet.png` | sheet |
| 4 | `clips/happy_sheet.png` | sheet |
| 5 | `clips/special_sheet.png` | sheet |

Đánh số `Prompt 01/5` … `05/5`.

---

## 7. Cách trả lời (ChatGPT/Gemini)

1. Xác nhận đã nhận `character_base.png` — dùng CHARACTER_LOCK mục 0.
2. Chốt **16 frame (4×4)** hoặc **12 frame (4×3)** cho cả bộ (một lựa chọn, không trộn).
3. Checklist 5 `PROMPT_ID`.
4. **5 prompt riêng** theo form mục 8.
5. Block `sheets` meta JSON (mục 3B).
6. Checklist pass/fail mục 4.

---

## 8. Cấu trúc prompt bắt buộc (mỗi sheet)

```text
[PROMPT_ID]: <ví dụ clips/idle_sheet.png>
[OUTPUT_KIND]: sprite_sheet
[MODE]: image-to-image / edit from attached reference — NOT text-to-image from scratch
[REFERENCE]: attached character_base.png — same character in every cell
[CHARACTER_LOCK]: Exact same character as the attached reference PNG: white round chibi head, long floppy white ears hanging down both sides, tiny vertical black oval eyes, soft pink oval blush under each eye, no nose, stubby white limbs, taupe/brown open coat, black-and-white checkered scarf with one end hanging down the front; thick clean black outlines; flat colors; same proportions and costume. Do not redesign.
[SHEET_LAYOUT]: 4 columns x 4 rows; 16 frames; each cell 512x512; full image 2048x2048; equal spacing; read left-to-right, top-to-bottom
[MOTION_TAG]: <idle|thinking|wave_hello|happy|special>
[EDIT]: Create ONE sprite sheet for THIS motion only. Full character in every cell including eyes and blush like the reference (do NOT remove eyes/mouth for layering; do NOT output separate face layers). Same scale and foot baseline in every cell. Flat chroma-key green background #00FF00 filling every empty pixel. No text, no frame numbers, no other motions.
[FRAMES]: mô tả ngắn tiến trình 16 frame (hoặc 12) — chuyển động nhỏ, mượt, loop được nếu motion loop
[STYLE]: match reference exactly — flat color, thick black outline, chibi sticker look
[BACKGROUND]: solid chroma key green #00FF00 (RGB 0,255,0) in every cell — NOT transparent, NOT white, NOT checkerboard
[NEGATIVE]: transparent background, alpha, checkerboard, white backdrop, rooftop, new character, redesign, separate eye/mouth layers, 4-frame sheet, other motions on same sheet, uneven cells, captions, frame numbers, green spill on character
[OUTPUT]: single PNG sprite sheet on solid #00FF00 green — 16 frames (or 12) of one motion only
```

Nếu chọn 12 frame: đổi `[SHEET_LAYOUT]` thành `4 columns x 3 rows; 12 frames; … full image 2048x1536`.

### Gợi ý nội dung `[FRAMES]` (ví dụ idle 16 frame)

Chia 16 bước thở/nhún nhẹ: hạ → nén → nhún lên → nghiêng nhẹ trái → về giữa → nghiêng nhẹ phải → … → về neutral. Biên độ nhỏ để loop kín.

### Ví dụ — Prompt 01/5 `idle_sheet.png`

```text
[PROMPT_ID]: clips/idle_sheet.png
[OUTPUT_KIND]: sprite_sheet
[MODE]: image-to-image / edit from attached reference — NOT text-to-image from scratch
[REFERENCE]: attached character_base.png — same character in every cell
[CHARACTER_LOCK]: Exact same character as the attached reference PNG: white round chibi head, long floppy white ears hanging down both sides, tiny vertical black oval eyes, soft pink oval blush under each eye, no nose, stubby white limbs, taupe/brown open coat, black-and-white checkered scarf with one end hanging down the front; thick clean black outlines; flat colors; same proportions and costume. Do not redesign.
[SHEET_LAYOUT]: 4 columns x 4 rows; 16 frames; each cell 512x512; full image 2048x2048; equal spacing; read left-to-right, top-to-bottom
[MOTION_TAG]: idle
[EDIT]: ONE sprite sheet for idle breathing only. Full face with eyes and blush in every cell. Same scale/baseline. Solid chroma-key green #00FF00 everywhere behind the character. No separate layers.
[FRAMES]: 16 subtle breath/bob steps, small squash-stretch, smooth loop back to frame 1
[STYLE]: match reference exactly
[BACKGROUND]: solid chroma key green #00FF00 (RGB 0,255,0) in every cell — NOT transparent, NOT white, NOT checkerboard
[NEGATIVE]: other motions, 4-frame sheet, face layers, captions, redesign, rooftop, checkerboard, transparent background, green spill
[OUTPUT]: single PNG sprite sheet 2048x2048 on solid #00FF00 — 16 idle frames only
```

→ Viết đủ Prompt 02/5 … 05/5 cho 4 motion còn lại.

---

## 9. Thứ tự làm việc

1. Attach `character_base.png`.
2. Chốt 16 frame (ưu tiên) hoặc 12 frame.
3. Prompt 01→05: `idle` → `thinking` → `wave_hello` → `happy` → `special`.
4. Xuất meta JSON + giao 5 file sheet.

---

## 10. Giao file cho team kỹ thuật

```text
mascot/
  sheets.json
  clips/
    idle_sheet.png
    thinking_sheet.png
    wave_hello_sheet.png
    happy_sheet.png
    special_sheet.png
```

**Không cần** `body.png` / `mouth-*.png` / `eyes-*.png`.  
Team **key phông xanh `#00FF00`** → transparent, cắt grid, rồi play 12–16 frame.

---

## 11. Prompt khởi động (copy cho ChatGPT/Gemini)

**Đính kèm** `character_base.png`.

```text
Bạn là art director + prompt engineer cho animation sprite sheets mascot 2D.

Tôi đính kèm character_base.png — nhân vật CHỐT, không redesign.

Đọc DESIGN REQUEST bên dưới.

QUY TẮC:
- Chỉ làm sprite sheet animation. KHÔNG tách layer mắt / mũi / miệng / body.
- Mỗi frame vẽ nhân vật đầy đủ (giữ mắt + má hồng như reference).
- NỀN BẮT BUỘC: phông xanh chroma key đặc #00FF00 — CẤM transparent / trắng / caro.
- 1 motion = 1 sheet = 1 prompt. Tổng 5 sheet.
- Mỗi sheet 16 frame (4x4, cell 512) — hoặc 12 frame (4x3) nếu model không chịu nổi 16; cả bộ phải cùng số frame.
- CẤM sheet 4 frame. CẤM gộp 5 motion vào 1 ảnh.
- Image-to-image/edit từ ảnh đính kèm.
- Form đủ tags mục 8. Đánh số Prompt 01/5 … 05/5.

[DÁN TOÀN BỘ DESIGN REQUEST TỪ MỤC 0]
```
