/* Dispatch slip: copy the invitation. No inline script, CSP friendly. */
const button = document.getElementById('copy-invitation');
const invitation = document.getElementById('agent-invitation');
const status = document.getElementById('copy-status');

if (button && invitation && status && navigator.clipboard?.writeText) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(invitation.textContent.trim());
      button.textContent = 'Copied';
      status.textContent = 'Ready to paste into your agent’s chat.';
    } catch {
      button.textContent = 'Copy';
      status.textContent = 'Clipboard unavailable — select the invitation text and copy it by hand.';
    }
  });
  button.hidden = false;
}
