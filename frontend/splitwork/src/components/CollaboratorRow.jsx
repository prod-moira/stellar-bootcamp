const CollaboratorRow = ({ index }) => {
  return (
    <div className="row">
      <input placeholder="Name / Role" />
      <input placeholder="Wallet Address" />
      <input type="number" placeholder="%" />
    </div>
  );
};