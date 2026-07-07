import React, { useState, useEffect } from 'react';
import Loader from '../../components/Loader.jsx';
import { contractsService } from '../../services/contractsService.js';
import { ContractApplicationsService } from '../../services/contractApplicationsService.js';
import useApplicationStore from '../../state/useApplicationStore.js';

export default function BrowseContractsPage() {
  const { applyForContract, loading: appLoading } = useApplicationStore();
  
  const [contracts, setContracts] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  const [formData, setFormData] = useState({ coverLetter: '', proposedRate: '', estimatedDuration: '' });

  useEffect(() => {
    const loadData = async () => {
      try {
        const contracts = await contractsService.list({ status: 'pending' });
        setContracts(contracts || []);
        
        const apps = await ContractApplicationsService.getMyApplications();
        setMyApplications(apps.data || []);
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const getApplicationContractId = (application) => {
    const contractRef = application.contractId || application.contract;
    return contractRef?._id || contractRef;
  };

  const hasApplied = (contractId) => myApplications.some(a => String(getApplicationContractId(a)) === String(contractId) && (a.status || "").toLowerCase() !== "cancelled");
  
  const getStatus = (contractId) => {
    const app = myApplications.find(a => String(getApplicationContractId(a)) === String(contractId));
    return app?.status || null;
  };

  const handleApply = (contract) => {
    setSelectedContract(contract);
    setFormData({ coverLetter: '', proposedRate: contract.amount || '', estimatedDuration: '' });
    setShowModal(true);
  };

  const handleQuickApply = async (contract) => {
    try {
      const dataToSubmit = {
        coverLetter: `Quick apply for ${contract.title}`,
        proposedRate: contract.amount || undefined,
        estimatedDuration: '',
      };
      await applyForContract(contract._id, dataToSubmit);
      const apps = await ContractApplicationsService.getMyApplications();
      setMyApplications(apps.data || []);
    } catch (err) {
      console.error('Quick apply failed', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const dataToSubmit = {
        coverLetter: formData.coverLetter,
        proposedRate: formData.proposedRate ? Number(formData.proposedRate) : undefined,
        estimatedDuration: formData.estimatedDuration,
      };
      await applyForContract(selectedContract._id, dataToSubmit);
      setShowModal(false);
      const apps = await ContractApplicationsService.getMyApplications();
      setMyApplications(apps.data || []);
    } catch (err) {
      console.error('Error:', err);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className='browse-contracts-container'>
      <h1>Browse Contracts</h1>
      <p>Find and apply for freelance work</p>
      
      {contracts.length === 0 ? (
        <p>No contracts available</p>
      ) : (
        <div className='contracts-grid'>
          {contracts.map(c => {
            const applied = hasApplied(c._id);
            const status = getStatus(c._id);
            const statusClass = status ? status.toString().toLowerCase() : '';
            
            return (
              <div key={c._id} className='contract-card'>
                <h3 className="contract-title">{c.title}</h3>
                <p className="contract-desc">{c.description}</p>

                <div className="meta">
                  <div className="meta-left">
                    {c.amount && <div className="budget">{c.currency} {c.amount}</div>}
                    <div className="tags">
                      {(c.tags || []).slice(0,3).map((t, i) => <div key={i} className="tag">{t}</div>)}
                    </div>
                  </div>

                  <div className="meta-right">
                    {applied && <div className={`status ${statusClass}`}>{status === 'pending' ? 'Pending' : status === 'accepted' ? 'Accepted' : 'Rejected'}</div>}
                  </div>
                </div>

                <div className='card-actions'>
                  <button 
                    onClick={() => handleApply(c)} 
                    disabled={applied || appLoading}
                    className={applied ? 'btn-applied' : 'btn-primary'}
                  >
                    {applied ? (status === 'rejected' ? 'Application Rejected' : 'Already Applied') : 'Apply Now'}
                  </button>
                  {!applied && (
                    <button onClick={() => handleQuickApply(c)} disabled={appLoading} className='btn-ghost'>Quick Apply</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && selectedContract && (
        <div className='modal-overlay' onClick={() => setShowModal(false)}>
          <div className='modal-content' onClick={e => e.stopPropagation()}>
            <h2>Apply for {selectedContract.title}</h2>
            <form onSubmit={handleSubmit}>
              <label>
                Cover Letter:
                <textarea 
                  value={formData.coverLetter}
                  onChange={e => setFormData({...formData, coverLetter: e.target.value})}
                  maxLength={1000}
                  rows={4}
                />
              </label>
              <label>
                Proposed Rate:
                <input 
                  type='number'
                  value={formData.proposedRate}
                  onChange={e => setFormData({...formData, proposedRate: e.target.value})}
                  min='0'
                />
              </label>
              <label>
                Estimated Duration:
                <input 
                  value={formData.estimatedDuration}
                  onChange={e => setFormData({...formData, estimatedDuration: e.target.value})}
                />
              </label>
              <div style={{display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                <button type='button' onClick={() => setShowModal(false)}>Cancel</button>
                <button type='submit' disabled={appLoading}>{appLoading ? 'Submitting...' : 'Submit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
