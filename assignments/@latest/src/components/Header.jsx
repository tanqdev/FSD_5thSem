import React from "react";

const Header = () => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        border: "1px solid black",
        padding: "0 50px ",
        color: "white",
        background: "dark-grey",
        alignItems: "center",
      }}
    >
      <img
        src="https://avatars.githubusercontent.com/u/48626910?s=200&v=4"
        alt=""
        width="100px"
        height="100px"
      />
      <div style={{ display: "flex", gap: "50px", color: "aliceblue" }}>
        <h2>Home</h2>
        <h2>About us</h2>
      </div>
    </div>
  );
};

export default Header;
