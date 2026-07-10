// Click-to-expand for mermaid diagrams (rendered as inline <svg id="mermaid-N">
// by rehype-mermaid at build time — see astro.config.mjs). Re-runs on
// astro:page-load since Starlight navigates via View Transitions, which
// doesn't re-fire DOMContentLoaded.
;(function () {
  function openOverlay(svg) {
    const overlay = document.createElement('div')
    overlay.className = 'mermaid-zoom-overlay'

    // Keep the id: mermaid's embedded <style> scopes every fill/stroke rule to
    // "#mermaid-N ..." — stripping it orphans those rules and the clone renders
    // as unstyled black-and-white shapes.
    const clone = svg.cloneNode(true)
    clone.removeAttribute('data-zoom-ready')
    overlay.appendChild(clone)

    function close() {
      overlay.remove()
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeydown)
    }
    function onKeydown(event) {
      if (event.key === 'Escape') close()
    }

    overlay.addEventListener('click', close)
    document.addEventListener('keydown', onKeydown)
    document.body.style.overflow = 'hidden'
    document.body.appendChild(overlay)
  }

  function init() {
    const diagrams = document.querySelectorAll('svg[id^="mermaid-"]:not([data-zoom-ready])')
    diagrams.forEach((svg) => {
      svg.setAttribute('data-zoom-ready', 'true')
      svg.setAttribute('role', 'button')
      svg.setAttribute('tabindex', '0')
      svg.setAttribute('aria-label', 'Expand diagram to full screen')
      svg.addEventListener('click', () => openOverlay(svg))
      svg.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openOverlay(svg)
        }
      })
    })
  }

  // astro:page-load covers post-navigation runs under Starlight's client router;
  // the immediate call covers the very first load, since this deferred script can
  // execute after that event has already fired once.
  init()
  document.addEventListener('astro:page-load', init)
})()
