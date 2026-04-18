const PaymentStatus = ({ status }) => {
  return (
    <div className="card">
      <h2>Payment Status</h2>

      {status === "pending" && <p>Waiting for payment...</p>}
      {status === "processing" && <p>Splitting funds...</p>}
      {status === "success" && <p>✅ All collaborators paid!</p>}
    </div>
  );
};