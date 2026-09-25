let soundOn = true
let soundVol = 0.9
let soundSet = 'duck'

const preloadedAudio = {
  duck: {
    press: new Audio('../../assets/Ya1.mp3'),
    release: new Audio('../../assets/Ya2.mp3'),
  },
  fx1: {
    press: new Audio('../../assets/D1.mp3'),
    release: new Audio('../../assets/D2.mp3'),
  },
}

// 受击专用音轨：独立实例，避免与摸头 press/release 抢同一 Audio 造成断音。
// 复用现有 4 个音频文件，不新增资源（BUG-005：禁止按次新建 Audio）。
const hitAudio = {
  duck: {
    normal: new Audio('../../assets/Ya2.mp3'),
    crit: new Audio('../../assets/Ya1.mp3'),
  },
  fx1: {
    normal: new Audio('../../assets/D2.mp3'),
    crit: new Audio('../../assets/D1.mp3'),
  },
}

// Preload settings
for (const set of Object.values(preloadedAudio)) {
  set.press.preload = 'auto'
  set.press.volume = soundVol
  set.release.preload = 'auto'
  set.release.volume = soundVol
}
for (const set of Object.values(hitAudio)) {
  for (const a of Object.values(set)) {
    a.preload = 'auto'
    a.volume = soundVol
  }
}

let pressing = false
let pressEnded = false
let releasePlayed = false
let releaseTimer = null

function getActiveAudio() {
  return preloadedAudio[soundSet] || preloadedAudio.duck
}

function applySoundSet(newSet, newVol, newOn) {
  if (typeof newSet === 'string') soundSet = newSet === 'fx1' ? 'fx1' : 'duck'
  if (typeof newVol === 'number') setVolume(newVol)
  if (typeof newOn === 'boolean') soundOn = newOn
}

function setVolume(vol) {
  soundVol = Math.max(0, Math.min(1, vol))
  soundOn = soundVol > 0
  for (const set of Object.values(preloadedAudio)) {
    set.press.volume = soundVol
    set.release.volume = soundVol
  }
  for (const set of Object.values(hitAudio)) {
    for (const a of Object.values(set)) a.volume = soundVol
  }
}

// 扣费受击音：normal 轻、crit 重，节流由 DamagePulse 侧保证
function playHit(kind) {
  if (!soundOn || soundVol <= 0) return
  const set = hitAudio[soundSet] || hitAudio.duck
  const a = kind === 'crit' ? set.crit : set.normal
  try {
    a.volume = Math.min(1, soundVol * (kind === 'crit' ? 1 : 0.6))
    a.currentTime = 0
    const p = a.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch (err) {}
}

function playPress() {
  if (!soundOn || soundVol <= 0) return
  const { press: pressAudio, release: releaseAudio } = getActiveAudio()
  try {
    if (releaseTimer) {
      clearTimeout(releaseTimer)
      releaseTimer = null
    }
    releaseAudio.pause()
    releaseAudio.currentTime = 0

    pressEnded = false
    releasePlayed = false
    pressAudio.onended = () => {
      pressEnded = true
      if (!pressing && !releasePlayed) playRelease()
    }
    pressAudio.currentTime = 0
    const p = pressAudio.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch (err) {}
}

function playRelease() {
  if (releasePlayed || !soundOn || soundVol <= 0) return
  releasePlayed = true
  const { release: releaseAudio } = getActiveAudio()
  try {
    releaseAudio.currentTime = 0
    const p = releaseAudio.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch (err) {}
}

function onSquishDown() {
  pressing = true
  playPress()
}

function onSquishUp() {
  pressing = false
  if (pressEnded) {
    playRelease()
    return
  }

  const { press: pressAudio } = getActiveAudio()
  let durKnown = false
  let remainMs = 0
  try {
    const dur = pressAudio ? pressAudio.duration : 0
    if (isFinite(dur) && dur > 0) {
      durKnown = true
      remainMs = (dur - pressAudio.currentTime) * 1000
    }
  } catch (err) {}

  if (durKnown) {
    releaseTimer = setTimeout(() => {
      releaseTimer = null
      playRelease()
    }, Math.max(0, remainMs - 100))
  }
}

window.AudioManager = {
  applySoundSet,
  playPress,
  playRelease,
  playHit,
  onSquishDown,
  onSquishUp,
  setVolume,
}
