const SplitForm = () => {
  const [collaborators, setCollaborators] = useState([
    { name: "", wallet: "", percentage: 0 }
  ]);

  const total = collaborators.reduce((sum, c) => sum + c.percentage, 0);

  return (
    <div className="card">
      <h2>Create Split</h2>

      {collaborators.map((c, i) => (
        <CollaboratorRow key={i} index={i} />
      ))}

      <button onClick={addRow}>+ Add Collaborator</button>

      <PercentageBar total={total} />

      <button disabled={total !== 100}>
        Continue
      </button>
    </div>
  );
};