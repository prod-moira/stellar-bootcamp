import { Link } from "react-router-dom";

export default function CreateSplit() {
  return (
    <div style={{ padding: "2rem" }}>
      <h2>Create Split</h2>
      <p>Add collaborators and percentages here.</p>

      <Link to="/invoice">
        <button>Continue to Invoice</button>
      </Link>
    </div>
  );
}