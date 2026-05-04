import { useState, useEffect } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { Target, UserPlus, Users, Tag, User, Building2, Mail, Phone, DollarSign } from 'lucide-react';
import { api } from '../lib/api';

// Extended interfaces that include BOTH raw DB fields and the legacy aliases
// the API transform adds on the way out (leadResponse / prospectResponse / customerResponse in crudFunctions.ts)
interface Lead {
  id: string;
  // raw DB columns
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  industry: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  // legacy aliases added by API transform
  lead_name: string;
  lead_email: string;
  lead_phone: string;
  lead_company: string;
  lead_position: string;
  lead_status: string;
  lead_source: string;
  lead_notes: string;
  lead_value?: number | null;
}

interface Prospect {
  id: string;
  // raw DB columns
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  // legacy aliases added by API transform
  prospect_name: string;
  prospect_email: string;
  prospect_phone: string;
  prospect_company: string;
  prospect_status: string;
  prospect_notes: string;
  prospect_value?: number | null;
}

interface Customer {
  id: string;
  // raw DB columns
  customer_company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // legacy aliases added by API transform
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_status: string;
  customer_value: number;
  customer_notes: string;
}

interface UserProfile {
  id: string;
  auth_user_id: string;
  name: string;
}

const leadStatuses = [
  { value: 'new',       label: 'New',       color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' },
  { value: 'contacted', label: 'Contacted', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' },
  { value: 'qualified', label: 'Qualified', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' },
  { value: 'lost',      label: 'Lost',      color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' },
];

const prospectStatuses = [
  { value: 'demo_scheduled', label: 'Demo Scheduled', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' },
  { value: 'demo_completed', label: 'Demo Completed', color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300' },
  { value: 'proposal_sent',  label: 'Proposal Sent',  color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' },
  { value: 'negotiation',    label: 'Negotiation',    color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' },
  { value: 'won',            label: 'Won',            color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' },
  { value: 'lost',           label: 'Lost',           color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' },
];

const customerStatuses = [
  { value: 'active',   label: 'Active',   color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' },
  { value: 'inactive', label: 'Inactive', color: 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300' },
  { value: 'at_risk',  label: 'At Risk',  color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' },
  { value: 'churned',  label: 'Churned',  color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' },
];

export default function SalesOverview() {
  const { getCurrencySymbol } = useCurrency();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'leads' | 'prospects' | 'customers'>('leads');
  const [draggedItem, setDraggedItem] = useState<{ type: 'lead' | 'prospect' | 'customer'; id: string } | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [leadsRes, prospectsRes, customersRes, usersRes] = await Promise.all([
      api.leads.getAll(),
      api.prospects.getAll(),
      api.customers.getAll(),
      api.users.getAll(),
    ]);
    if (leadsRes.data)     setLeads(leadsRes.data as unknown as Lead[]);
    if (prospectsRes.data) setProspects(prospectsRes.data as unknown as Prospect[]);
    if (customersRes.data) setCustomers(customersRes.data as unknown as Customer[]);
    if (usersRes.data)     setUsers(usersRes.data as unknown as UserProfile[]);
    setLoading(false);
  };

  // assigned_to stores auth_user_id
  const getUserName = (authUserId: string | null) => {
    if (!authUserId) return null;
    return users.find(u => u.auth_user_id === authUserId)?.name ?? null;
  };

  const getLeadsByStatus     = (status: string) => leads.filter(l => (l.lead_status || (l as any).status || '').toLowerCase() === status);
  const getProspectsByStatus = (status: string) => prospects.filter(p => (p.prospect_status || (p as any).status || '').toLowerCase() === status);
  const getCustomersByStatus = (status: string) => customers.filter(c => (c.customer_status || (c as any).status || 'active').toLowerCase() === status);

  const formatValue = (val: number | null | undefined) =>
    val ? `${getCurrencySymbol()}${val.toLocaleString('en-IN')}` : null;

  const handleDragStart = (e: React.DragEvent, type: 'lead' | 'prospect' | 'customer', id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => { setDraggedItem(null); setDragOverStatus(null); };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStatus !== status) setDragOverStatus(status);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverStatus(null);
    const item = draggedItem;
    setDraggedItem(null);
    if (!item) return;

    if (item.type === 'lead') {
      const lead = leads.find(l => l.id === item.id);
      if (!lead || (lead.lead_status || '').toLowerCase() === targetStatus) return;
      if (targetStatus === 'qualified') {
        await convertLeadToProspect(lead);
        setActiveTab('prospects');
      } else {
        // Update using the raw DB column name
        await api.leads.update(item.id, { status: targetStatus } as any);
      }
    } else if (item.type === 'prospect') {
      const prospect = prospects.find(p => p.id === item.id);
      if (!prospect || (prospect.prospect_status || '').toLowerCase() === targetStatus) return;
      if (targetStatus === 'won') {
        await convertProspectToCustomer(prospect);
        setActiveTab('customers');
      } else {
        await api.prospects.update(item.id, { status: targetStatus } as any);
      }
    } else if (item.type === 'customer') {
      const customer = customers.find(c => c.id === item.id);
      if (!customer || (customer.customer_status || 'active').toLowerCase() === targetStatus) return;
      const { error: custErr } = await api.customers.update(item.id, { status: targetStatus } as any);
      if (custErr) { alert('Error updating customer status: ' + custErr.message); return; }
    }

    await loadData();
  };

  const convertLeadToProspect = async (lead: Lead) => {
    const companyName = lead.lead_company || lead.company_name || lead.lead_name || 'Unknown';
    const { error: createErr } = await api.prospects.create({
      prospect_company: companyName,
      prospect_name:    lead.lead_name || lead.contact_name || null,
      prospect_email:   lead.lead_email || lead.email || null,
      prospect_phone:   lead.lead_phone || lead.phone || null,
      prospect_status:  'demo_scheduled',
      prospect_notes:   lead.lead_notes || lead.notes || null,
      assigned_to:      lead.assigned_to,
    } as any);
    if (createErr) { alert('Error creating prospect: ' + createErr.message); return; }
    const { error: delErr } = await api.leads.delete(lead.id);
    if (delErr) alert('Error removing lead: ' + delErr.message);
  };

  const convertProspectToCustomer = async (prospect: Prospect) => {
    const companyName = prospect.prospect_company || prospect.company_name || prospect.prospect_name || 'Unknown';
    const { error } = await api.customers.create({
      customer_company: companyName,
      customer_name:    prospect.prospect_name || prospect.contact_name || null,
      customer_email:   prospect.prospect_email || prospect.email || null,
      customer_phone:   prospect.prospect_phone || prospect.phone || null,
      customer_notes:   prospect.prospect_notes || prospect.notes || null,
    } as any);
    if (!error) await api.prospects.delete(prospect.id);
    else alert('Error converting prospect to customer: ' + error.message);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">CRM Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Visualize your sales pipeline</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('leads')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Leads</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{leads.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {formatValue(leads.reduce((s, l) => s + (l.lead_value || 0), 0)) ?? '₹0.00'} potential value
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Target className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('prospects')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Prospects</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{prospects.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {formatValue(prospects.reduce((s, p) => s + (p.prospect_value || 0), 0)) ?? '₹0.00'} potential value
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <UserPlus className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('customers')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Customers</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{customers.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {formatValue(customers.reduce((s, c) => s + (c.customer_value || 0), 0)) ?? '₹0.00'} lifetime value
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Users className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Kanban */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
        <div className="border-b border-slate-200 dark:border-slate-700">
          <div className="flex">
            <button onClick={() => setActiveTab('leads')} className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'leads' ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
              Leads ({leads.length})
            </button>
            <button onClick={() => setActiveTab('prospects')} className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'prospects' ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
              Prospects ({prospects.length})
            </button>
            <button onClick={() => setActiveTab('customers')} className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'customers' ? 'border-green-600 text-green-600 dark:border-green-400 dark:text-green-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
              Customers ({customers.length})
            </button>
          </div>
        </div>

        <div className="p-6">

          {/* ── LEADS kanban ── */}
          {activeTab === 'leads' && (
            <div className="overflow-x-auto pb-2">
              <div className="inline-flex gap-4" style={{ minWidth: `${leadStatuses.length * 300}px` }}>
                {leadStatuses.map(status => {
                  const colLeads = getLeadsByStatus(status.value);
                  const isOver   = dragOverStatus === status.value;
                  const isQual   = status.value === 'qualified';
                  return (
                    <div
                      key={status.value}
                      className={`flex-shrink-0 w-72 rounded-lg border-2 transition-all ${isOver ? 'border-blue-400 shadow-md' : 'border-transparent'}`}
                      onDragOver={(e) => handleDragOver(e, status.value)}
                      onDrop={(e) => handleDrop(e, status.value)}
                    >
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 h-full">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{status.label}</h3>
                          <div className="flex items-center gap-1.5">
                            {isQual && <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-medium">→ Prospect</span>}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{colLeads.length}</span>
                          </div>
                        </div>
                        {isQual && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-3">Drop here to qualify as Prospect</p>}
                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                          {colLeads.map(lead => (
                            <div
                              key={lead.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, 'lead', lead.id)}
                              onDragEnd={handleDragEnd}
                              className={`bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing border border-slate-200 dark:border-slate-700 select-none ${draggedItem?.id === lead.id ? 'opacity-40' : ''}`}
                            >
                              <h4 className="font-medium text-slate-900 dark:text-white mb-1">{lead.lead_name}</h4>
                              {lead.lead_company && (
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1">
                                  <Building2 className="w-3 h-3 flex-shrink-0" />
                                  {lead.lead_company}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {lead.lead_source && (
                                  <span className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                                    <Tag className="w-3 h-3" />{lead.lead_source}
                                  </span>
                                )}
                                {lead.lead_position && (
                                  <span className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                                    {lead.lead_position}
                                  </span>
                                )}
                              </div>
                              {lead.assigned_to && getUserName(lead.assigned_to) && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                  <User className="w-3 h-3" />{getUserName(lead.assigned_to)}
                                </p>
                              )}
                              {lead.lead_value ? (
                                <div className="flex items-center text-sm text-green-600 dark:text-green-400 mt-1">
                                  <DollarSign className="w-4 h-4 mr-1" />{formatValue(lead.lead_value)}
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {colLeads.length === 0 && (
                            <div className={`border-2 border-dashed rounded-lg py-6 text-center transition-colors ${isOver ? 'border-blue-400 bg-blue-50/20 dark:bg-blue-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{isOver ? 'Release to move here' : 'No leads'}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PROSPECTS kanban ── */}
          {activeTab === 'prospects' && (
            <div className="overflow-x-auto pb-2">
              <div className="inline-flex gap-4" style={{ minWidth: `${prospectStatuses.length * 300}px` }}>
                {prospectStatuses.map(status => {
                  const colProspects = getProspectsByStatus(status.value);
                  const isOver       = dragOverStatus === status.value;
                  const isWon        = status.value === 'won';
                  return (
                    <div
                      key={status.value}
                      className={`flex-shrink-0 w-72 rounded-lg border-2 transition-all ${isOver ? 'border-emerald-400 shadow-md' : 'border-transparent'}`}
                      onDragOver={(e) => handleDragOver(e, status.value)}
                      onDrop={(e) => handleDrop(e, status.value)}
                    >
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 h-full">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{status.label}</h3>
                          <div className="flex items-center gap-1.5">
                            {isWon && <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded-full font-medium">→ Customer</span>}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{colProspects.length}</span>
                          </div>
                        </div>
                        {isWon && <p className="text-[10px] text-green-600 dark:text-green-400 mb-3">Drop here to convert to Customer</p>}
                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                          {colProspects.map(prospect => (
                            <div
                              key={prospect.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, 'prospect', prospect.id)}
                              onDragEnd={handleDragEnd}
                              className={`bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing border border-slate-200 dark:border-slate-700 select-none ${draggedItem?.id === prospect.id ? 'opacity-40' : ''}`}
                            >
                              <h4 className="font-medium text-slate-900 dark:text-white mb-1">{prospect.prospect_name}</h4>
                              {prospect.prospect_company && (
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1">
                                  <Building2 className="w-3 h-3 flex-shrink-0" />
                                  {prospect.prospect_company}
                                </p>
                              )}
                              {prospect.assigned_to && getUserName(prospect.assigned_to) && (
                                <p className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                  <User className="w-3 h-3" />{getUserName(prospect.assigned_to)}
                                </p>
                              )}
                              {prospect.prospect_value ? (
                                <div className="flex items-center gap-1 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded mt-2 w-fit">
                                  <DollarSign className="w-4 h-4" />{formatValue(prospect.prospect_value)}
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {colProspects.length === 0 && (
                            <div className={`border-2 border-dashed rounded-lg py-6 text-center transition-colors ${isOver ? 'border-emerald-400 bg-emerald-50/20 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{isOver ? 'Release to move here' : 'No prospects'}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── CUSTOMERS kanban ── */}
          {activeTab === 'customers' && (
            <div className="overflow-x-auto pb-2">
              <div className="inline-flex gap-4" style={{ minWidth: `${customerStatuses.length * 300}px` }}>
                {customerStatuses.map(status => {
                  const colCustomers = getCustomersByStatus(status.value);
                  const isOver = dragOverStatus === status.value;
                  return (
                    <div
                      key={status.value}
                      className={`flex-shrink-0 w-72 rounded-lg border-2 transition-all ${isOver ? 'border-green-400 shadow-md' : 'border-transparent'}`}
                      onDragOver={(e) => handleDragOver(e, status.value)}
                      onDrop={(e) => handleDrop(e, status.value)}
                    >
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 h-full">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{status.label}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{colCustomers.length}</span>
                        </div>
                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                          {colCustomers.map(customer => (
                            <div
                              key={customer.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, 'customer', customer.id)}
                              onDragEnd={handleDragEnd}
                              className={`bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing border border-slate-200 dark:border-slate-700 select-none ${draggedItem?.id === customer.id ? 'opacity-40' : ''}`}
                            >
                              <h4 className="font-medium text-slate-900 dark:text-white mb-1">{customer.customer_name}</h4>
                              {customer.customer_company && (
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1">
                                  <Building2 className="w-3 h-3 flex-shrink-0" />
                                  {customer.customer_company}
                                </p>
                              )}
                              {customer.customer_email && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                  <Mail className="w-3 h-3 flex-shrink-0" />{customer.customer_email}
                                </p>
                              )}
                              {customer.customer_phone && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 flex-shrink-0" />{customer.customer_phone}
                                </p>
                              )}
                              {customer.customer_value > 0 && (
                                <div className="flex items-center text-sm text-green-600 dark:text-green-400 mt-2">
                                  <DollarSign className="w-4 h-4 mr-1" />{formatValue(customer.customer_value)}
                                </div>
                              )}
                            </div>
                          ))}
                          {colCustomers.length === 0 && (
                            <div className={`border-2 border-dashed rounded-lg py-6 text-center transition-colors ${isOver ? 'border-green-400 bg-green-50/20 dark:bg-green-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{isOver ? 'Release to move here' : 'No customers'}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
