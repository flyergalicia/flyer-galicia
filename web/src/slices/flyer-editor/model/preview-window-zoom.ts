// The zoom of the window of Vista previa. It lives out of React: these events come by the dozen.
// 100 % is the whole flyer on a computer and its width on a phone, and never more than its real size.
const STEP = 1.25;
const MOST_OF_REAL_SIZE = 1.5;
const SMALLEST_ROOM = 100;
const DOUBLE_CLICK_ZOOM = 2.5;
const SAME = 0.0001;
const ZOOMED = 1.001;
const RESIZE_WAIT_MS = 150;
const PHONE_WIDTH = "(max-width:900px)";

export interface PreviewWindowZoom {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly seeWhole: () => void;
  readonly stop: () => void;
}

export interface PreviewWindowZoomOptions {
  readonly body: HTMLElement;
  readonly image: HTMLImageElement;
  readonly onPercent: (percent: number) => void;
  readonly onZoomed: (isZoomed: boolean) => void;
  readonly onPanning: (isPanning: boolean) => void;
}

function clamp(value: number, smallest: number, largest: number): number {
  return Math.min(Math.max(value, smallest), largest);
}

function distance([one, other]: readonly [Touch, Touch]): number {
  return Math.hypot(one.clientX - other.clientX, one.clientY - other.clientY) || 1;
}

function twoFingers({ touches }: TouchEvent): readonly [Touch, Touch] | null {
  const [one, other] = [touches[0], touches[1]];
  return touches.length === 2 && one && other ? [one, other] : null;
}

export function attachPreviewWindowZoom({
  body,
  image,
  onPercent,
  onZoomed,
  onPanning,
}: PreviewWindowZoomOptions): PreviewWindowZoom {
  let zoom = 1;

  const baseWidth = () => {
    if (!image.naturalWidth) return 0;
    const roomWide = Math.max(body.clientWidth - 2, SMALLEST_ROOM);
    const roomHigh = Math.max(body.clientHeight - 2, SMALLEST_ROOM);
    const isPhone = window.matchMedia(PHONE_WIDTH).matches;
    const scale = isPhone
      ? roomWide / image.naturalWidth
      : Math.min(roomWide / image.naturalWidth, roomHigh / image.naturalHeight);
    return Math.min(scale, 1) * image.naturalWidth;
  };

  const largestZoom = () => {
    const base = baseWidth();
    return base ? Math.max(1, (image.naturalWidth * MOST_OF_REAL_SIZE) / base) : 1;
  };

  const apply = () => {
    const base = baseWidth();
    if (!base) return;
    image.style.width = `${String(Math.round(base * zoom))}px`;
    onZoomed(zoom > ZOOMED);
    onPercent(Math.round(zoom * 100));
  };

  /** It leaves still the point of the screen it is given: the mouse, the fingers or the middle. */
  const zoomTo = (wanted: number, at?: { readonly x: number; readonly y: number }) => {
    if (!image.naturalWidth) return;
    const next = clamp(wanted, 1, largestZoom());
    if (Math.abs(next - zoom) < SAME) return;
    const room = body.getBoundingClientRect();
    const { x, y } = at ?? { x: room.left + room.width / 2, y: room.top + room.height / 2 };
    const before = image.getBoundingClientRect();
    const fractionX = clamp((x - before.left) / before.width, 0, 1);
    const fractionY = clamp((y - before.top) / before.height, 0, 1);
    zoom = next;
    apply();
    const after = image.getBoundingClientRect();
    body.scrollLeft += after.left + fractionX * after.width - x;
    body.scrollTop += after.top + fractionY * after.height - y;
  };

  const seeWhole = () => {
    zoom = 1;
    apply();
    body.scrollTop = 0;
    body.scrollLeft = 0;
  };

  let steps = 0;
  let mouse = { x: 0, y: 0 };
  let pending = 0;
  const onWheel = (event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    steps += event.deltaY < 0 ? 1 : -1;
    mouse = { x: event.clientX, y: event.clientY };
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const taken = steps;
      steps = 0;
      if (taken) zoomTo(zoom * STEP ** taken, mouse);
    });
  };

  const onDoubleClick = ({ clientX, clientY }: MouseEvent) => {
    if (zoom > ZOOMED) {
      seeWhole();
      return;
    }
    const base = baseWidth();
    if (!base) return;
    const toWidth = (body.clientWidth - 2) / base;
    zoomTo(toWidth > MOST_OF_REAL_SIZE ? toWidth : DOUBLE_CLICK_ZOOM, { x: clientX, y: clientY });
  };

  let panning: { x: number; y: number; left: number; top: number } | null = null;
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || zoom <= ZOOMED) return;
    panning = {
      x: event.clientX,
      y: event.clientY,
      left: body.scrollLeft,
      top: body.scrollTop,
    };
    onPanning(true);
    event.preventDefault();
  };
  const onMouseMove = ({ clientX, clientY }: MouseEvent) => {
    if (!panning) return;
    body.scrollLeft = panning.left - (clientX - panning.x);
    body.scrollTop = panning.top - (clientY - panning.y);
  };
  const onMouseUp = () => {
    if (!panning) return;
    panning = null;
    onPanning(false);
  };

  let pinch: { distance: number; zoom: number } | null = null;
  const onTouchStart = (event: TouchEvent) => {
    const fingers = twoFingers(event);
    if (!fingers) return;
    pinch = { distance: distance(fingers), zoom };
    event.preventDefault();
  };
  const onTouchMove = (event: TouchEvent) => {
    const fingers = twoFingers(event);
    if (!pinch || !fingers) return;
    event.preventDefault();
    const [one, other] = fingers;
    zoomTo((pinch.zoom * distance(fingers)) / pinch.distance, {
      x: (one.clientX + other.clientX) / 2,
      y: (one.clientY + other.clientY) / 2,
    });
  };
  const onTouchEnd = ({ touches }: TouchEvent) => {
    if (touches.length < 2) pinch = null;
  };

  const zoomIn = () => {
    zoomTo(zoom * STEP);
  };
  const zoomOut = () => {
    zoomTo(zoom / STEP);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = { "+": zoomIn, "=": zoomIn, "-": zoomOut, _: zoomOut, 0: seeWhole }[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  let resizing: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizing);
    resizing = setTimeout(apply, RESIZE_WAIT_MS);
  };

  body.addEventListener("wheel", onWheel, { passive: false });
  body.addEventListener("dblclick", onDoubleClick);
  body.addEventListener("mousedown", onMouseDown);
  body.addEventListener("touchstart", onTouchStart, { passive: false });
  body.addEventListener("touchmove", onTouchMove, { passive: false });
  body.addEventListener("touchend", onTouchEnd);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  image.addEventListener("load", seeWhole);
  if (image.complete) seeWhole();

  return {
    zoomIn,
    zoomOut,
    seeWhole,
    stop: () => {
      if (pending) cancelAnimationFrame(pending);
      clearTimeout(resizing);
      body.removeEventListener("wheel", onWheel);
      body.removeEventListener("dblclick", onDoubleClick);
      body.removeEventListener("mousedown", onMouseDown);
      body.removeEventListener("touchstart", onTouchStart);
      body.removeEventListener("touchmove", onTouchMove);
      body.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      image.removeEventListener("load", seeWhole);
    },
  };
}
