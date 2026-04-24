import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { azureStorage } from '../../lib/azure';

export default function DangerZone() {
  const { userProfile, hasWriteAccess } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleResetSystem = async () => {
    if (confirmText !== 'DELETE ALL DATA') {
      alert('Please type "DELETE ALL DATA" to confirm');
      return;
    }

    setIsDeleting(true);

    try {
      /* bulk delete tickets via api */
      /* bulk delete devices via api */
      /* bulk delete delivery_items via api */
      /* bulk delete deliveries via api */
      /* bulk delete sale_items via api */
      /* bulk delete sales via api */
      /* bulk delete purchase_order_items via api */
      /* bulk delete purchase_orders via api */
      /* bulk delete assembly_items via api */
      /* bulk delete assembly_units via api */
      /* bulk delete assemblies via api */
      /* bulk delete bom_items via api */
      /* bulk delete boms via api */
      /* bulk delete purchases via api */
      /* bulk delete inventory_items via api */
      /* bulk delete prospects via api */
      /* bulk delete leads via api */
      /* bulk delete customers via api */
      /* bulk delete vendors via api */
      /* bulk delete message_reads via api */
      /* bulk delete message_attachments via api */
      /* bulk delete messages via api */
      /* bulk delete activity_logs via api */

      try {
        const _listResult = await azureStorage.list('message-media', );
        if (folders) {
          for (const folder of folders) {
            const _listResult = await azureStorage.list('message-media', folder.name);
            if (files && files.length > 0) {
              const filePaths = files.map(file => `${folder.name}/${file.name}`);
              await azureStorage.remove('message-media', filePaths);
            }
          }
        }
      } catch (error) {
        console.error('Error deleting message media:', error);
      }

      await api.activityLogs.create('ACTION', {});

      alert('System reset successfully! All data has been deleted.');
      setShowConfirmModal(false);
      setConfirmText('');
      window.location.reload();
    } catch (error) {
      console.error('Error resetting system:', error);
      alert('Failed to reset system. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!hasWriteAccess) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-6 h-6" />
          <h2 className="text-xl font-bold">Danger Zone</h2>
        </div>
        <div className="border-2 border-amber-200 dark:border-amber-800 rounded-lg p-6 bg-amber-50 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            This section is only available to users with Read/Write access. You currently have Read Only access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
        <AlertTriangle className="w-6 h-6" />
        <h2 className="text-xl font-bold">Danger Zone</h2>
      </div>

      <div className="border-2 border-red-200 dark:border-red-900 rounded-lg p-6 bg-red-50 dark:bg-red-950/20">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-200">
              Reset System & Delete All Data
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              This action will permanently delete all data including:
            </p>
            <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 mt-2 space-y-1">
              <li>All leads and prospects</li>
              <li>All customers</li>
              <li>All purchase orders</li>
              <li>All sales and deliveries</li>
              <li>All devices and support tickets</li>
              <li>All vendors</li>
              <li>All inventory items</li>
              <li>All purchases</li>
              <li>All BOMs (Bill of Materials)</li>
              <li>All assemblies and assembly history</li>
              <li>All traceability records</li>
              <li>All message history</li>
              <li>All activity logs</li>
            </ul>
            <p className="text-sm text-red-700 dark:text-red-300 mt-2 font-medium">
              User accounts and authentication will NOT be affected.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setShowConfirmModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset System & Delete All Data</span>
            </button>
          </div>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-xl font-bold">Confirm System Reset</h3>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                This action is <strong className="text-red-600 dark:text-red-400">permanent and cannot be undone</strong>.
                All data will be permanently deleted.
              </p>

              <p className="text-sm text-slate-700 dark:text-slate-300">
                To confirm, type <strong className="font-mono">DELETE ALL DATA</strong> below:
              </p>

              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE ALL DATA"
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-slate-700 dark:text-white font-mono"
                autoFocus
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmText('');
                }}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetSystem}
                disabled={isDeleting || confirmText !== 'DELETE ALL DATA'}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete All Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
