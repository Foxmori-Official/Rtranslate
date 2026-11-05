let nextListId = 0

/** Keyboard/focus contract for bundled, single-select listboxes (DOM focus on options). */
export function bindListboxKeyboard(
  wrap: HTMLElement,
  button: HTMLButtonElement,
  list: HTMLElement,
  isOpen: () => boolean,
  open: () => void,
  close: () => void,
): void {
  list.id ||= `rt-listbox-${++nextListId}`
  button.id ||= `${list.id}-trigger`
  button.setAttribute('aria-controls', list.id)
  button.setAttribute('aria-expanded', 'false')
  list.setAttribute('aria-labelledby', button.id)
  const getOptions = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>('[role="option"]')]
  for (const option of getOptions()) option.tabIndex = -1

  wrap.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (isOpen()) { event.preventDefault(); close(); button.focus() }
      return
    }
    if (event.key === 'Tab') { close(); return }
    const options = getOptions()
    if (!options.length) return
    const active = options.indexOf(document.activeElement as HTMLElement)
    const activate = event.key === 'Enter' || event.key === ' '
    if (activate && active >= 0) {
      event.preventDefault()
      options[active].click()
      // A selection may synchronously replace this UI (e.g. onboarding).
      if (button.isConnected) button.focus()
      return
    }
    if (!activate && !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (activate && event.target !== button) return
    event.preventDefault()
    const wasOpen = isOpen()
    open()
    let index = active < 0 ? options.findIndex(el => el.getAttribute('aria-selected') === 'true') : active
    if (index < 0) index = event.key === 'ArrowUp' ? options.length - 1 : 0
    if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = options.length - 1
    else if (!activate && wasOpen && active >= 0) index = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[index].focus()
  })
}
