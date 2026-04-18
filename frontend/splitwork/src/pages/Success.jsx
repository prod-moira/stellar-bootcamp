import { Link } from "react-router-dom";

export default function Success() {
  return (
    <div style={{ padding: "2rem" }}>
      <h2>✅ Payment Successful</h2>
      <p>All collaborators have been paid.</p>

      <Link to="/">
        <button>Back to Dashboard</button>
      </Link>
    </div>
  );
}