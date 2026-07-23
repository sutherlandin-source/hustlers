import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import { contractsService } from "../../services/contractsService.js";
import { ContractApplicationsService } from "../../services/contractApplicationsService.js";

export default function BrowseContractsPage() {
  const navigate = useNavigate();

  const [contracts, setContracts] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [contractsResponse, applicationsResponse] = await Promise.all([
          contractsService.list({ status: "pending" }),
          ContractApplicationsService.getMyApplications(),
        ]);

        setContracts(Array.isArray(contractsResponse) ? contractsResponse : []);
        setMyApplications(Array.isArray(applicationsResponse?.data) ? applicationsResponse.data : []);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const availableContracts = useMemo(() => {
    return (contracts || []).filter((contract) => {
      const buyerRole = String(contract?.buyer?.role || "").toLowerCase();
      const status = String(contract?.status || "").toLowerCase();
      return status === "pending" && buyerRole === "manager";
    });
  }, [contracts]);

  const getApplicationContractId = (application) => {
    const contractRef = application.contractId || application.contract;
    return contractRef?._id || contractRef;
  };

  const hasApplied = (contractId) =>
    myApplications.some((application) => String(getApplicationContractId(application)) === String(contractId));

  const getStatus = (contractId) => {
    const application = myApplications.find((item) => String(getApplicationContractId(item)) === String(contractId));
    return application?.status || null;
  };

  const openJobDetails = (contractId) => {
    navigate(`/dashboard/contracts/${contractId}`);
  };

  if (loading) return <Loader />;

  return (
    <div className="browse-contracts-container">
      <h1>Browse Contracts</h1>
      <p>Open contracts posted by managers</p>

      {availableContracts.length === 0 ? (
        <p>No open contracts available</p>
      ) : (
        <div className="contracts-grid">
          {availableContracts.map((contract) => {
            const applied = hasApplied(contract._id);
            const status = getStatus(contract._id);
            const statusClass = status ? String(status).toLowerCase() : "";

            return (
              <div key={contract._id} className="contract-card">
                <h3 className="contract-title">{contract.title}</h3>
                <p className="contract-desc">{contract.description}</p>

                <div className="meta">
                  <div className="meta-left">
                    {contract.amount && (
                      <div className="budget">
                        {contract.currency} {contract.amount}
                      </div>
                    )}
                    <div className="tags">
                      {(contract.tags || []).slice(0, 3).map((tag, index) => (
                        <div key={index} className="tag">
                          {tag}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="meta-right">
                    {applied && (
                      <div className={`status ${statusClass}`}>
                        {status === "pending" ? "Pending" : status === "accepted" ? "Accepted" : "Rejected"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="card-actions">
                  <button onClick={() => openJobDetails(contract._id)} className="btn-primary">
                    View Contract Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
