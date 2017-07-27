let model;
const FIELD_CLASS = 'shoobx-field';
const FIELD_INNER_CLASS = 'shoobx-field-inner';
const FIELD_CORNER_CLASS = 'shoobx-field-corner';
const FIELD_CORNER_INDEX_ATTR = 'data-shoobx-corner-index';
const FIELD_ID_ATTR = 'data-shoobx-field-id';
const PAGE_NUM_ATTR = 'data-page-number';

function createCornerElement(win, index) {
  const corner = win.document.createElement('div');
  corner.classList.add(FIELD_CORNER_CLASS);
  corner.setAttribute(FIELD_CORNER_INDEX_ATTR, index);
  return corner;
}

function createFieldElement(win, id) {
  const div = win.document.createElement('div');
  const inner = win.document.createElement('div');
  inner.classList.add(FIELD_INNER_CLASS);
  inner.appendChild(createCornerElement(win, 0));
  inner.appendChild(createCornerElement(win, 1));
  inner.appendChild(createCornerElement(win, 2));
  inner.appendChild(createCornerElement(win, 3));
  div.appendChild(inner);
  div.setAttribute(FIELD_ID_ATTR, id === undefined ? model.length : id);
  div.classList.add(FIELD_CLASS);
  return div;
}

function createPercentFieldProps(top, left, width, height, pageWidth, pageHeight) {
  return {
    top: top / pageHeight * 100,
    left: left / pageWidth * 100,
    width: width / pageWidth * 100,
    height: height / pageHeight * 100,
  };
}

function computeStartPointsFromOppositeCorner(corner, field, pageEl, pageBorderSize) {
  const index = corner.getAttribute(FIELD_CORNER_INDEX_ATTR);
  const topPosition = parseInt(field.offsetTop) + pageEl.offsetTop + pageBorderSize;
  const leftPosition = parseInt(field.offsetLeft) + pageEl.offsetLeft + pageBorderSize;
  switch ( index ) {
  // 0 is top left, so start is bottom right
  case "0":
    return {
      startY: topPosition + parseInt(field.clientHeight),
      startX: leftPosition + parseInt(field.clientWidth),
    };
  // 1 is top right, so start is bottom left
  case "1":
    return {
      startY: topPosition + parseInt(field.clientHeight),
      startX: leftPosition,
    };
  // 2 is bottom left, so start is top right
  case "2":
    return {
      startY: topPosition,
      startX: leftPosition + parseInt(field.clientWidth),
    };
  // 3 is bottom right, so start is top left
  case "3":
    return {
      startY: topPosition,
      startX: leftPosition,
    };
  }
}

function augmentWithDragStream(win, rx, container, stream, mapFn) {
  return stream.switchMap(originalEvt => {
    const scrollEvents$ = rx.Observable.fromEvent(container, 'scroll').startWith(null);
    const mouseMoveEvents$ = rx.Observable.fromEvent(win, 'mousemove');
    const mouseMovesWithScrolls$ = rx.Observable.combineLatest(scrollEvents$, mouseMoveEvents$, (scroll, mouseMove) => mouseMove);
    return mouseMovesWithScrolls$.takeUntil(rx.Observable.fromEvent(win, 'mouseup'))
      .map(mouseMoveEvent => mapFn(originalEvt, mouseMoveEvent));
  })
}

function addDrawEventsToPage(win, rx, container, pageElement) {
  const pageBorderSize = parseInt(win.getComputedStyle(pageElement).borderTopWidth);
  const mouseDown$ = rx.Observable.fromEvent(pageElement, 'mousedown');
  const creationEvent$ = mouseDown$
    .filter(({ target: { classList } }) => !classList.contains(FIELD_INNER_CLASS) && !classList.contains(FIELD_CORNER_CLASS))
    .map(({ clientY, clientX }) => {
      const startY = clientY - container.offsetTop + container.scrollTop;
      const startX = clientX - container.offsetLeft + container.scrollLeft;
      const field = createFieldElement(win);
      return { startX, startY, field };
    });
  const editEvent$ = mouseDown$
    .filter(({ target: { classList } }) => classList.contains(FIELD_CORNER_CLASS))
    .map(({ target }) => {
      const field = target.parentNode.parentNode;
      return Object.assign(computeStartPointsFromOppositeCorner(target, field, pageElement, pageBorderSize), { field });
    });
  const allEvent$ = rx.Observable.merge(creationEvent$, editEvent$);
  return augmentWithDragStream(win, rx, container, allEvent$, ({ startX, startY, field }, { clientX, clientY }) => {
    const { offsetTop: pageOffsetTop, offsetLeft: pageOffsetLeft } = pageElement;
    const currentX = clientX - container.offsetLeft + container.scrollLeft;
    const currentY = clientY - container.offsetTop + container.scrollTop;
    const width = Math.abs(clientX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.max(0, Math.min(clientX, startX) - pageOffsetLeft - pageBorderSize);
    const top = Math.max(0, Math.min(currentY, startY) - pageOffsetTop - pageBorderSize);
    return {
      field,
      pageElement,
      fieldProperties: createPercentFieldProps(
        top,
        left,
        currentX > startX ? Math.min(width, pageElement.clientWidth - left) : Math.min(width, startX - pageOffsetLeft),
        currentY > startY ? Math.min(height, pageElement.clientHeight - top) : Math.min(height, startY - pageOffsetTop),
        pageElement.clientWidth,
        pageElement.clientHeight
      ),
    };
  });
}

function createMovementStream(win, rx, container) {
  const innnerClick$ = rx.Observable.fromEvent(container, 'mousedown')
    .filter(({ target }) => target.classList.contains(FIELD_INNER_CLASS));
  return augmentWithDragStream(win, rx, container, innnerClick$, ({ target }, { movementX, movementY }) => {
    const field = target.parentNode;
    const pageElement = field.parentNode;
    const { clientHeight: pageHeight, clientWidth: pageWidth } = pageElement;
    const curX = parseInt(field.offsetLeft);
    const curY = parseInt(field.offsetTop);
    const width = parseInt(field.clientWidth);
    const height = parseInt(field.clientHeight);
    const top = Math.max(0, Math.min(movementY + curY, pageHeight - height));
    const left = Math.max(0, Math.min(movementX + curX, pageWidth - width));
    return {
      field,
      fieldProperties: createPercentFieldProps(top, left, width, height, pageWidth, pageHeight),
      pageElement,
    };
  });
}

function renderBox({ field, fieldProperties: { top, left, width, height }, pageElement }) {
  const { clientWidth, clientHeight } = pageElement;
  const fieldId = parseInt(field.getAttribute(FIELD_ID_ATTR));
  if ( !model[fieldId] ) {
    const pageNumber = parseInt(pageElement.getAttribute(PAGE_NUM_ATTR));
    model.push({ pageNumber });
  }
  if ( !field.parentNode ) {
    pageElement.appendChild(field);
  }
  field.style.width = `${width}%`;
  field.style.height = `${height}%`;
  field.style.left = `${left}%`;
  field.style.top = `${top}%`;
  Object.assign(model[fieldId], { top, left, width, height });
}

function convertModelFieldToHtml(win, pageElement, fld, index) {
  return {
    field: createFieldElement(win, index),
    fieldProperties: { top: fld.top, left: fld.left, width: fld.width, height: fld.height },
    pageElement,
  };
}

function createRenderEvent(win, rx, pages) {
  const pageRender$ = rx.Observable.fromEvent(win, 'pagerendered').map(evt => {
    const { pageNumber } = evt.detail;
    return model
      .map((fld, index) => [fld, index])
      .filter(([fld]) => fld.pageNumber === pageNumber)
      .map(([fld, originalIndex])  => convertModelFieldToHtml(win, evt.target, fld, originalIndex));
  });
  return pageRender$
    .startWith(model.map((fld, index) => convertModelFieldToHtml(win, pages[fld.pageNumber - 1], fld, index)))
    .switchMap(ar => rx.Observable.from(ar));
}

function addDrawEvents(win, rx) {
  const pages = win.document.querySelectorAll('#viewer > .page');
  const container = win.document.getElementById('viewerContainer');
  const allPageStreams = Array.prototype.map.call(pages, addDrawEventsToPage.bind(null, win, rx, container));
  const movement$ = createMovementStream(win, rx, container);
  const renderAllEvent$ = createRenderEvent(win, rx, pages);
  rx.Observable.merge(movement$, renderAllEvent$, ...allPageStreams).subscribe(renderBox, error => {
    console.error(error);
  });
}

function initDrawablePDF(win, rx) {
  win.addEventListener('documentload', () => {
    win.document.body.style.userSelect = 'none';
    model = [{
      pageNumber: 1,
      top: 50,
      left: 50,
      width: 10,
      height: 10,
    }];
    addDrawEvents(win, rx);
  });
}

initDrawablePDF(window, window.Rx);
