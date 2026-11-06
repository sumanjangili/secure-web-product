// frontend/src/components/DeleteAccountForm.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { secureFetchJson, ApiError, getErrorMessage } from '../lib/fetch-helper';

const CONFIRM_PHRASE = 'DELETE';

export const DeleteAccountForm = () => {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mountedRef = useRef(true);
  const confirmMatches = confirmText.trim() === CONFIRM_PHRASE;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Wipe the password from state on unmount (never persist a secret)
  useEffect(() => {
    return () => {
      setPassword('');
    };
  }, []);

  const handleDelete = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (deleting || !confirmMatches) return;

      setDeleting(true);
      setError(null);

      try {
        await secureFetchJson('/delete-user', {
          method: 'POST',
          body: JSON.stringify({
            password,
            reason: 'User-initiated GDPR erasure',
          }),
        });

        if (!mountedRef.current) return;

        // ✅ Clear the secret immediately on success
        setPassword('');
        setSuccess(true);
        setTimeout(() => {
          // Server already cleared both cookies via Set-Cookie;
          // full reload guarantees no cached authenticated state lingers.
          window.location.href = '/login';
        }, 2000);
      } catch (err: unknown) {
        if (!mountedRef.current) return;

        if (err instanceof ApiError) {
          if (err.status === 401) {
            setError('Incorrect password. Account deletion requires password confirmation.');
          } else if (err.status === 403) {
            setError('Security check failed. Refresh the page and try again.');
          } else if (err.status === 429) {
            const bodyValue = Number(err.data?.retryAfter);
            const waitMin = Number.isFinite(bodyValue) && bodyValue > 0
              ? Math.ceil(bodyValue / 60)
              : 60;
            setError(`Too many deletion attempts. Please try again in ${waitMin} minute(s) or contact support.`);
          } else {
            setError(
              getErrorMessage(err.data, err.message || 'Deletion failed')
            );
          }
        } else {
          setError('Network error. Try again.');
        }

        // ✅ Clear password on ALL error paths (same fix as SecureForm)
        setPassword('');
      } finally {
        if (mountedRef.current) setDeleting(false);
      }
    },
    [deleting, confirmMatches, password]
  );

  if (success) {
    return (
      <div className="success-message" role="status" aria-live="polite">
        ✅ Your account has been permanently deleted. Redirecting to login...
      </div>
    );
  }

  return (
    <form onSubmit={handleDelete} className="danger-zone-form" noValidate>
      <h3>Delete Account</h3>
      <p>
        This action is <strong>irreversible</strong>. All your data — including
        secure submissions, consent records, and audit history linked to your
        account — will be permanently erased.
      </p>

      <label htmlFor="delete-confirm">
        Type <strong>{CONFIRM_PHRASE}</strong> to confirm:
        <input
          id="delete-confirm"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          autoComplete="off"
          spellCheck={false}
          disabled={deleting}
        />
      </label>

      <label htmlFor="delete-password">
        Confirm your password to continue:
        <input
          id="delete-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={deleting}
        />
      </label>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={deleting || !confirmMatches || password.length === 0}
        aria-busy={deleting}
      >
        {deleting ? 'Deleting...' : 'Permanently Delete My Account'}
      </button>
    </form>
  );
};
