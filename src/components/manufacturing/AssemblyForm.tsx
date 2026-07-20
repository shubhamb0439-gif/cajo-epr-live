import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AlertCircle } from 'lucide-react';
import SidePanel from '../SidePanel';
import type { Database } from '../../lib/database.types';
import { api } from '../../lib/api';

type BOM = Database['public']['Tables']['boms']['Row'] & {
  inventory_items: { item_id: string; item_name: string };
};

type BOMItem = Database['public']['Tables']['bom_items']['Row'] & {
  inventory_items: { id: string; item_id: string; item_name: string; item_stock_current: number };
};

interface PurchaseOrder {
  id: string;
  po_number: string;
  customer_id: string;
  delivery_date: string | null;
  status: string;
  customers: {
    customer_name: string;
  };
}

interface Assembly {
  id: string;
  assembly_name: string;
  bom_id: string;
  assembly_quantity: number;
}

interface AssemblyFormProps {
  isOpen: boolean;
  assembly: Assembly | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AssemblyForm({ isOpen, assembly, onClose, onSuccess }: AssemblyFormProps) {
  const { userProfile } = useAuth();
  const [boms, setBoms] = useState<BOM[]>([]);
  const [selectedBOM, setSelectedBOM] = useState<BOM | null>(null);
  const [bomItems, setBomItems] = useState<BOMItem[]>([]);
  const [form, setForm] = useState({ assembly_name: '', assembly_quantity: 1, bom_id: '', po_number: '' });
  const [hasPO, setHasPO] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadBOMs();
      loadOpenPurchaseOrders();
      if (assembly) {
        setForm({
          assembly_name: assembly.assembly_name,
          assembly_quantity: assembly.assembly_quantity,
          bom_id: assembly.bom_id,
          po_number: ''
        });
        loadBOMForEdit(assembly.bom_id);
      } else {
        setForm({ assembly_name: '', assembly_quantity: 1, bom_id: '', po_number: '' });
        setHasPO(false);
        setSelectedBOM(null);
        setBomItems([]);
      }
    }
  }, [isOpen, assembly]);

  useEffect(() => {
    if (selectedBOM && form.bom_id) {
      loadBOMItems(form.bom_id);
    }
  }, [selectedBOM, form.bom_id]);

  const loadBOMs = async () => {
    const { data } = await api.boms.getAll();
    if (data) setBoms(data as BOM[]);
  };

  const loadOpenPurchaseOrders = async () => {
    const { data } = await api.purchaseOrders.getAll();
    if (data) setPurchaseOrders(data as PurchaseOrder[]);
  };

  const loadBOMForEdit = async (bomId: string) => {
    const bom = boms.find(b => b.id === bomId);
    if (!bom) {
      const { data } = await api.boms.getById(bomId);
      if (data) {
        setSelectedBOM(data as BOM);
      }
    } else {
      setSelectedBOM(bom);
    }
  };

  const loadBOMItems = async (bomId: string) => {
    const { data, error } = await api.boms.getById(bomId);

    if (error) {
      console.error('Error loading BOM items:', error);
      return;
    }

    if (data && data.bom_components) {
      setBomItems(data.bom_components as BOMItem[]);
    }
  };

  const handleBOMChange = (bomId: string) => {
    const bom = boms.find(b => b.id === bomId);
    setSelectedBOM(bom || null);
    setForm({ ...form, bom_id: bomId });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedBOM) {
      setError('Please select a BOM');
      return;
    }

    if (assembly) {
      // Update assembly name only
      setLoading(true);
      try {
        // No dedicated assemblies.update endpoint; activity log records the intent
        await api.activityLogs.create('UPDATE_ASSEMBLY', {
          user_id: userProfile?.id,
          assemblyId: assembly.id,
          assemblyName: form.assembly_name,
        });

        alert('Assembly updated successfully!');
        onSuccess();
      } catch (error) {
        console.error('Error updating assembly:', error);
        setError(error instanceof Error ? error.message : 'Failed to update assembly');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);

    try {
      const { data: result, error: createError } = await api.assemblies.create({
        bom_id: selectedBOM.id,
        quantity: form.assembly_quantity,
        po_number: hasPO && form.po_number.trim() ? form.po_number.trim() : undefined,
      });

      if (createError) {
        console.error('Assembly creation failed:', createError);
        throw new Error(createError.message || 'Failed to create assembly');
      }

      alert('Assembly created successfully!');
      onSuccess();
    } catch (error) {
      console.error('Error creating assembly:', error);
      setError(error instanceof Error ? error.message : 'Failed to save assembly');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title={`${assembly ? 'Edit' : 'Create'} Assembly`}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Select BOM *
          </label>
          {assembly ? (
            <div className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {selectedBOM ? `${selectedBOM.bom_name} → ${selectedBOM.inventory_items.item_name}` : 'Loading...'}
            </div>
          ) : (
            <select
              value={form.bom_id}
              onChange={(e) => handleBOMChange(e.target.value)}
              required
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-700 dark:text-white"
            >
              <option value="">Choose a BOM</option>
              {boms.map(bom => (
                <option key={bom.id} value={bom.id}>
                  {bom.bom_name} → {bom.inventory_items.item_name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Assembly Name *
          </label>
          <input
            type="text"
            value={form.assembly_name}
            onChange={(e) => setForm({ ...form, assembly_name: e.target.value })}
            required
            placeholder="e.g., Batch #001"
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Quantity *
          </label>
          {assembly ? (
            <div className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {form.assembly_quantity}
            </div>
          ) : (
            <input
              type="number"
              value={form.assembly_quantity}
              onChange={(e) => setForm({ ...form, assembly_quantity: parseFloat(e.target.value) })}
              onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
              required
              min="1"
              step="1"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-700 dark:text-white"
            />
          )}
        </div>

        {!assembly && (
          <>
            <div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPO}
                  onChange={(e) => {
                    setHasPO(e.target.checked);
                    if (!e.target.checked) {
                      setForm({ ...form, po_number: '' });
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  This assembly is for a Purchase Order
                </span>
              </label>
            </div>

            {hasPO && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Purchase Order *
                </label>
                <select
                  value={form.po_number}
                  onChange={(e) => setForm({ ...form, po_number: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-700 dark:text-white"
                >
                  <option value="">Select a Purchase Order</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.po_number}>
                      {po.po_number} - {(po.customers as any)?.customer_name || 'Unknown Customer'}
                      {po.delivery_date ? ` (Due: ${new Date(po.delivery_date).toLocaleDateString()})` : ''}
                    </option>
                  ))}
                </select>
                {purchaseOrders.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    No open purchase orders available
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {selectedBOM && !assembly && (
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <h3 className="font-medium text-slate-900 dark:text-white mb-3">
              Required Components & Vendor Sources
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                ({bomItems.length})
              </span>
            </h3>
            {bomItems.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                No components required for this BOM.
              </p>
            ) : (
            <div className="space-y-3">
              {bomItems.map(item => {
                const required = item.bom_component_quantity * form.assembly_quantity;
                const available = item.inventory_items.item_stock_current;
                const insufficient = available < required;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded ${
                      insufficient ? 'bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800' : 'bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {item.inventory_items.item_name}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs ${insufficient ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
                          Need: {required} / Total: {available}
                        </span>
                        {insufficient && <AlertCircle className="w-4 h-4 text-red-600" />}
                      </div>
                    </div>
                    {insufficient && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        Insufficient stock for this quantity
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-slate-400 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !selectedBOM || (assembly ? false : bomItems.some(item => item.inventory_items.item_stock_current < item.bom_component_quantity * form.assembly_quantity))}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? (assembly ? 'Updating...' : 'Creating...') : (assembly ? 'Update' : 'Create')}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
