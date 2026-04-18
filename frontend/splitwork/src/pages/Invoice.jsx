import { Link } from "react-router-dom";

export default function Invoice() {
  return (
    <div style={{ padding: "2rem" }}>
      <h2>Invoice</h2>
      <p>Payment breakdown will show here.</p>

      <Link to="/success">
        <button>Simulate Payment</button>
      </Link>
    </div>
  );
}