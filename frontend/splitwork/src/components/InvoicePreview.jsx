const InvoicePreview = ({ split }) => {
  return (
    <div className="card">
      <h2>Invoice</h2>

      <p>Total: {split.amount} USDC</p>

      {split.collaborators.map(c => (
        <div key={c.wallet}>
          {c.name}: {c.percentage}% → {split.amount * (c.percentage / 100)} USDC
        </div>
      ))}

      <button>Generate Payment Link</button>
    </div>
  );
};