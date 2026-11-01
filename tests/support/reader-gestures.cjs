// Ranges below only MEASURE glyph positions. Selection is always made by mouse input.
async function visibleLine(frame, selector, index = 0) {
  let clip = null;
  if (typeof frame.frameElement === 'function') {
    const element = await frame.frameElement();
    clip = await element.evaluate(el => {
      const r = el.getBoundingClientRect(), p = el.closest('.epub-container').getBoundingClientRect();
      return { left: Math.max(0, p.left) - r.left, right: Math.min(innerWidth, p.right) - r.left,
        top: Math.max(0, p.top) - r.top, bottom: Math.min(innerHeight, p.bottom) - r.top };
    });
  }
  return frame.evaluate(({ selector, index, clip }) => {
    if (!document.querySelector(selector)) return null;
    const root = document.body;
    const lines = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.parentElement.closest(selector)) continue;
      if (!node.textContent.trim() || node.parentElement.closest('script,style,a[href],button,[data-annotation-ui],[data-reader-selection-ui]')) continue;
      const style = getComputedStyle(node.parentElement);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const bounds = { ...(clip || { left: 0, right: innerWidth, top: 0, bottom: innerHeight }) };
      for (let parent = node.parentElement; parent && !clip; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) continue;
        const box = parent.getBoundingClientRect();
        bounds.top = Math.max(bounds.top, box.top); bounds.bottom = Math.min(bounds.bottom, box.bottom);
      }
      // Keep the gesture away from scroll-container edges: native dragging there
      // intentionally auto-scrolls, invalidating coordinates measured before input.
      bounds.top += 32; bounds.bottom -= 32;
      let line = null; let letters = 0;
      for (let i = 0; i < node.textContent.length; i++) {
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1);
        const b = r.getBoundingClientRect();
        if (!b.width || !b.height || b.left < bounds.left || b.right > bounds.right || b.top < bounds.top || b.bottom > bounds.bottom) continue;
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!hit || !node.parentElement.contains(hit)) continue;
        if (!line || Math.abs(line.y - (b.top + b.height / 2)) > 4) {
          line = { start: b.left + 1, end: b.right - 1, y: b.top + b.height / 2, text: node.textContent[i] };
          lines.push(line); letters = 0;
        } else { line.end = b.right - 1; line.text += node.textContent[i]; }
        letters = /[\p{L}\p{N}]/u.test(node.textContent[i]) ? letters + 1 : 0;
        if (line.wordX === undefined && letters >= 2 && /[\p{L}\p{N}]/u.test(node.textContent[i + 1] || "")) line.wordX = b.left + b.width / 2;
      }
      if (lines.filter(l => l.text.trim().length > 12).length > index) break;
    }
    return lines.filter(l => l.text.trim().length > 12)[index] || null;
  }, { selector, index, clip });
}

async function mouseSelect(page, frame, selector, { index = 0, slow = false, double = false, onHold } = {}) {
  await page.bringToFront();
  await frame.evaluate(() => document.fonts.ready);
  if (process.env.BLABLA_GESTURE_TRACE) console.log('measure');
  const line = await visibleLine(frame, selector, index);
  if (process.env.BLABLA_GESTURE_TRACE) console.log('measured', line);
  if (!line) throw Error('No visible text line for ' + selector);
  let offset = { x: 0, y: 0 };
  if (frame !== page) offset = await (await frame.frameElement()).boundingBox();
  if (process.env.BLABLA_GESTURE_TRACE) console.log('offset', offset);
  const x = offset.x + line.start, y = offset.y + line.y;
  const wordX = offset.x + (line.wordX ?? line.start);
  const end = offset.x + Math.min(line.end, line.start + 260);
  if (frame !== page) {
    // Chromium native input, bypassing Playwright's drag/drop instrumentation
    // which stalls in EPUB's sandboxed (scripts disabled) iframe.
    const input = await page.context().newCDPSession(page);
    try {
      const send = (type, px, buttons, clickCount = 1) => input.send('Input.dispatchMouseEvent', {
        type, x: px, y, button: buttons ? 'left' : 'none', buttons, clickCount,
      });
      await send('mouseMoved', x, 0);
      if (double) {
        for (const clickCount of [1, 2]) {
          await send('mousePressed', wordX, 1, clickCount);
          await input.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: wordX, y, button: 'left', buttons: 0, clickCount });
        }
      } else {
        await send('mousePressed', x, 1);
        for (let i = 1; i <= 12; i++) {
          await send('mouseMoved', x + (end - x) * i / 12, 1);
          if (slow && i === 6) { await page.waitForTimeout(350); await onHold?.(); }
        }
        await input.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end, y, button: 'left', buttons: 0, clickCount: 1 });
      }
    } finally { await input.detach(); }
  }
  else if (double) await page.mouse.dblclick(wordX, y);
  else {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move((x + end) / 2, y, { steps: 8 });
    if (slow) { await page.waitForTimeout(350); await onHold?.(); }
    await page.mouse.move(end, y, { steps: 10 }); await page.mouse.up();
  }
  if (process.env.BLABLA_GESTURE_TRACE) console.log('input sent');
  return { line, selected: await frame.evaluate(() => getSelection()?.toString() || '') };
}
module.exports = { visibleLine, mouseSelect };
