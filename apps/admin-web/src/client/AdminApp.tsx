import { useCallback, useEffect, useState } from 'react';
import type {
  BackendHealth,
  PendingVatRequest,
  VatRequestError
} from './types';

interface AdminAppViewProps {
  errors: VatRequestError[];
  health: BackendHealth | undefined;
  onDeleteError?: (errorId: string) => Promise<void>;
  onResolveError?: (errorId: string, silent: boolean) => Promise<void>;
  onUpdateVatRequest?: (input: UpdateVatRequestInput) => Promise<void>;
  pending: PendingVatRequest[];
}

interface UpdateVatRequestInput {
  newVatNumber: string;
  telegramChatId: string;
  vatNumber: string;
}

interface DashboardData {
  errors: VatRequestError[];
  health: BackendHealth | undefined;
  pending: PendingVatRequest[];
}

export function AdminApp() {
  const [dashboard, setDashboard] = useState<DashboardData>({
    errors: [],
    health: undefined,
    pending: []
  });
  const [status, setStatus] = useState('Loading admin data...');

  const loadDashboard = useCallback(async () => {
    setStatus('Loading admin data...');
    try {
      const [health, pending, errors] = await Promise.all([
        fetchJson<BackendHealth>('/api/health'),
        fetchJson<PendingVatRequest[]>('/api/vat-requests'),
        fetchJson<VatRequestError[]>('/api/vat-request-errors')
      ]);
      setDashboard({ errors, health, pending });
      setStatus('');
    } catch (error) {
      setDashboard({ errors: [], health: undefined, pending: [] });
      setStatus(error instanceof Error ? error.message : 'Admin data failed');
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const updateVatRequest = useCallback(
    async (input: UpdateVatRequestInput) => {
      await sendJson('/api/vat-requests', 'PATCH', input);
      await loadDashboard();
    },
    [loadDashboard]
  );

  const resolveError = useCallback(
    async (errorId: string, silent: boolean) => {
      const search = silent ? '?silent=true' : '';
      await sendEmpty(
        `/api/vat-request-errors/${errorId}/resolve${search}`,
        'POST'
      );
      await loadDashboard();
    },
    [loadDashboard]
  );

  const deleteError = useCallback(
    async (errorId: string) => {
      await sendEmpty(`/api/vat-request-errors/${errorId}`, 'DELETE');
      await loadDashboard();
    },
    [loadDashboard]
  );

  return (
    <>
      {status ? <p className="status-message">{status}</p> : null}
      <AdminAppView
        errors={dashboard.errors}
        health={dashboard.health}
        onDeleteError={deleteError}
        onResolveError={resolveError}
        onUpdateVatRequest={updateVatRequest}
        pending={dashboard.pending}
      />
    </>
  );
}

export function AdminAppView({
  errors,
  health,
  onDeleteError,
  onResolveError,
  onUpdateVatRequest,
  pending
}: AdminAppViewProps) {
  const backendStatus = health?.ok ? 'Backend online' : 'Backend offline';
  const pollingStatus = health?.telegramPolling
    ? 'Telegram polling on'
    : 'Telegram polling off';

  return (
    <main>
      <header>
        <h1>VIES VAT Checker Admin</h1>
      </header>
      <section aria-label="Service status" className="status-grid">
        <StatusCard
          label="Backend"
          tone={health?.ok ? 'online' : 'offline'}
          value={backendStatus}
        />
        <StatusCard label="Telegram" value={pollingStatus} />
        <StatusCard label="Pending VAT" value={`${pending.length} pending`} />
        <StatusCard
          label="Errors"
          value={`${errors.length} error${errors.length === 1 ? '' : 's'}`}
        />
      </section>
      <section aria-labelledby="pending-heading" className="section">
        <h2 id="pending-heading">Pending VAT requests</h2>
        <PendingVatTable
          onUpdateVatRequest={onUpdateVatRequest}
          requests={pending}
        />
      </section>
      <section aria-labelledby="errors-heading" className="section">
        <h2 id="errors-heading">VAT request errors</h2>
        <VatRequestErrorTable
          errors={errors}
          onDeleteError={onDeleteError}
          onResolveError={onResolveError}
        />
      </section>
    </main>
  );
}

function StatusCard({
  label,
  tone,
  value
}: {
  label: string;
  tone?: 'offline' | 'online';
  value: string;
}) {
  return (
    <article className="status-card">
      <p className="label">{label}</p>
      <p className={`value ${tone ?? ''}`}>{value}</p>
    </article>
  );
}

function PendingVatTable({
  onUpdateVatRequest,
  requests
}: {
  onUpdateVatRequest?: (input: UpdateVatRequestInput) => Promise<void>;
  requests: PendingVatRequest[];
}) {
  if (requests.length === 0) {
    return <p className="empty">No pending VAT requests.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>VAT number</th>
          <th>Telegram Chat ID</th>
          <th>Expires</th>
          <th>Update</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((request) => (
          <PendingVatRow
            key={`${request.telegramChatId}:${formatVatNumber(request)}`}
            onUpdateVatRequest={onUpdateVatRequest}
            request={request}
          />
        ))}
      </tbody>
    </table>
  );
}

function PendingVatRow({
  onUpdateVatRequest,
  request
}: {
  onUpdateVatRequest?: (input: UpdateVatRequestInput) => Promise<void>;
  request: PendingVatRequest;
}) {
  const vatNumber = formatVatNumber(request);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newVatNumber = form.get('newVatNumber');
    if (typeof newVatNumber !== 'string' || newVatNumber.trim() === '') {
      return;
    }

    await onUpdateVatRequest?.({
      newVatNumber,
      telegramChatId: request.telegramChatId,
      vatNumber
    });
    event.currentTarget.reset();
  }

  return (
    <tr>
      <td>
        <code>{vatNumber}</code>
      </td>
      <td>
        <code>{request.telegramChatId}</code>
      </td>
      <td>{formatDate(request.expirationDate)}</td>
      <td>
        <form onSubmit={handleSubmit}>
          <input
            aria-label={`New VAT number for ${vatNumber}`}
            name="newVatNumber"
            placeholder="New VAT number"
          />
          <button type="submit">Update</button>
        </form>
      </td>
    </tr>
  );
}

function VatRequestErrorTable({
  errors,
  onDeleteError,
  onResolveError
}: {
  errors: VatRequestError[];
  onDeleteError?: (errorId: string) => Promise<void>;
  onResolveError?: (errorId: string, silent: boolean) => Promise<void>;
}) {
  if (errors.length === 0) {
    return <p className="empty">No VAT request errors.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>VAT number</th>
          <th>Telegram Chat ID</th>
          <th>Error</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {errors.map((error) => (
          <VatRequestErrorRow
            error={error}
            key={error.id}
            onDeleteError={onDeleteError}
            onResolveError={onResolveError}
          />
        ))}
      </tbody>
    </table>
  );
}

function VatRequestErrorRow({
  error,
  onDeleteError,
  onResolveError
}: {
  error: VatRequestError;
  onDeleteError?: (errorId: string) => Promise<void>;
  onResolveError?: (errorId: string, silent: boolean) => Promise<void>;
}) {
  return (
    <tr>
      <td>
        <code>{formatVatNumber(error.vatRequest)}</code>
      </td>
      <td>
        <code>{error.vatRequest.telegramChatId}</code>
      </td>
      <td>{error.error}</td>
      <td>
        <div className="actions">
          <button
            onClick={() => void onResolveError?.(error.id, false)}
            type="button"
          >
            Resolve
          </button>
          <button
            className="secondary"
            onClick={() => void onResolveError?.(error.id, true)}
            type="button"
          >
            Resolve silently
          </button>
          <button
            className="danger"
            onClick={() => void onDeleteError?.(error.id)}
            type="button"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return await response.json();
}

async function sendJson(path: string, method: string, body: unknown) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json'
    },
    method
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
}

async function sendEmpty(path: string, method: string) {
  const response = await fetch(path, { method });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
}

function formatVatNumber(
  request: Pick<PendingVatRequest, 'countryCode' | 'vatNumber'>
) {
  return `${request.countryCode}${request.vatNumber}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
