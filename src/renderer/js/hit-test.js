let hitBitmap = null
let hitWidth = 610
let hitHeight = 610
let hitReady = false
let imgElementRef = null
let isLeftFlippedRef = () => false
let isMenuOpenRef = () => false
let isBubbleOpenRef = () => false

function initHitTest(imgElement, isFlippedGetter, isMenuOpenGetter, isBubbleOpenGetter) {
  imgElementRef = imgElement
  isLeftFlippedRef = isFlippedGetter || (() => false)
  isMenuOpenRef = isMenuOpenGetter || (() => false)
  isBubbleOpenGetter = isBubbleOpenGetter || (() => false)

  try {
    const probe = new Image()
    probe.onload = () => {
      try {
        const offCanvas = document.createElement('canvas')
        hitWidth = probe.naturalWidth || 610
        hitHeight = probe.naturalHeight || 610
        offCanvas.width = hitWidth
        offCanvas.height = hitHeight
        const ctx = offCanvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(probe, 0, 0, hitWidth, hitHeight)
        const imgData = ctx.getImageData(0, 0, hitWidth, hitHeight).data

        // Precompute binary alpha mask for instant O(1) lookup
        hitBitmap = new Uint8Array(hitWidth * hitHeight)
        for (let i = 0; i < hitBitmap.length; i++) {
          hitBitmap[i] = imgData[i * 4 + 3] > 10 ? 1 : 0
        }
        hitReady = true
      } catch (err) {
        console.error('Hit test bitmap precompute failed:', err)
      }
    }
    probe.onerror = (err) => console.error('Hit test probe error:', err)
    probe.src = imgElement.src
  } catch (err) {
    console.error('Hit test init error:', err)
  }
}

function isWhaleHit(clientX, clientY) {
  if (!imgElementRef) return true
  try {
    const r = imgElementRef.getBoundingClientRect()
    if (!r || r.width <= 0 || r.height <= 0) return false

    // Check bounding rect first
    if (
      clientX < r.left ||
      clientX > r.right ||
      clientY < r.top ||
      clientY > r.bottom
    ) {
      return false
    }

    if (!hitReady || !hitBitmap) return true

    let lx = Math.floor(((clientX - r.left) / r.width) * hitWidth)
    const ly = Math.floor(((clientY - r.top) / r.height) * hitHeight)

    if (lx < 0 || lx >= hitWidth || ly < 0 || ly >= hitHeight) return false
    if (isLeftFlippedRef()) lx = hitWidth - 1 - lx

    const idx = ly * hitWidth + lx
    return hitBitmap[idx] === 1
  } catch (err) {
    return true
  }
}

function isInteractiveElement(clientX, clientY) {
  // If menu is open, the entire menu and window must be interactive
  if (isMenuOpenRef()) {
    const menuEl = document.getElementById('menu-box')
    if (menuEl) {
      const mr = menuEl.getBoundingClientRect()
      if (
        clientX >= mr.left - 10 &&
        clientX <= mr.right + 10 &&
        clientY >= mr.top - 10 &&
        clientY <= mr.bottom + 10
      ) {
        return true
      }
    }
    // Also allow clicking outside to close
    return true
  }

  // Check if over menu button
  const menuBtn = document.getElementById('menu-btn')
  if (menuBtn) {
    const br = menuBtn.getBoundingClientRect()
    // Generous buffer around menu button for easy clicking
    if (
      clientX >= br.left - 12 &&
      clientX <= br.right + 12 &&
      clientY >= br.top - 12 &&
      clientY <= br.bottom + 12
    ) {
      return true
    }
  }

  // Check if bubble is open and clicked
  const bubbleBox = document.getElementById('whale-bubble')
  if (bubbleBox && bubbleBox.classList.contains('dshwv-bubble-open')) {
    const bbr = bubbleBox.getBoundingClientRect()
    if (
      clientX >= bbr.left &&
      clientX <= bbr.right &&
      clientY >= bbr.top &&
      clientY <= bbr.bottom
    ) {
      return true
    }
  }

  // Check if hitting the whale body
  return isWhaleHit(clientX, clientY)
}

window.HitTest = {
  initHitTest,
  isWhaleHit,
  isInteractiveElement,
}
