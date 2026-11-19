import React from "react";
import { useState } from "react";

const CounterApp = () => {
  const [cnt, setCnt] = useState(0);
  function handleInc() {
    if (cnt == 10) {
      alert("No more than 10");
      return;
    }
    setCnt(cnt + 1);
  }
  function handleDec() {
    if (cnt == 0) {
      alert("No less than 0");
      return;
    }
    setCnt(cnt - 1);
  }
  return (
    <div>
      <div>Count={cnt}</div>
      <div
        style={{
          gap: "10px",
          width: "100px",
        }}
      >
        <button onClick={handleInc}>Increase</button>
        <button onClick={handleDec}>Decrease</button>
      </div>
    </div>
  );
};

export default CounterApp;
