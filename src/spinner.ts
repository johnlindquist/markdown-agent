/**
 * Simple spinner for CLI feedback
 * Shows an animated spinner with a message while work is in progress
 */

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

let currentFrame = 0;
let interval: ReturnType<typeof setInterval> | null = null;
let currentMessage = '';

function render() {
  const frame = SPINNER_FRAMES[currentFrame % SPINNER_FRAMES.length];
  // Clear line, write spinner + message
  process.stderr.write(`\r\x1B[K${frame} ${currentMessage}`);
  currentFrame++;
}

/**
 * Start the spinner with a message
 * Only shows on TTY terminals
 */
export function startSpinner(message: string): void {
  if (!process.stderr.isTTY) return;
  if (interval) return; // Already running

  currentMessage = message;
  currentFrame = 0;

  // Hide cursor
  process.stderr.write('\x1B[?25l');
  render();
  interval = setInterval(render, 80);
}

/**
 * Stop the spinner and clear the line
 */
export function stopSpinner(): void {
  if (!interval) return;

  clearInterval(interval);
  interval = null;

  // Clear line and show cursor
  process.stderr.write('\r\x1B[K');
  process.stderr.write('\x1B[?25h');
}

/**
 * Check if spinner is currently running
 */
export function isSpinnerRunning(): boolean {
  return interval !== null;
}
