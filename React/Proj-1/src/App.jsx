import React from "react";
import Student1 from "./components/Student1";

const App = () => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <h1>My Student Records</h1>
      <div style={{ display: "flex", gap: "20px" }}>
        <Student1 />
        <br />
        <Student1 />
        <br />
        <Student1 />
      </div>
    </div>
  );
};

export default App;
