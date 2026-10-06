import React from "react";

const Student1 = () => {
  return (
    <div>
      <div
        style={{
          border: "2px solid red",
          width: "300px",
          height: "400px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1>Shinosuke Nohara</h1>
        <img
          src="https://m.media-amazon.com/images/I/31moF9vmVtL._SY300_SX300_QL70_FMwebp_.jpg"
          alt=""
          height="100px"
          width="100px"
          srcset=""
        />
        <h3>Roll No:101</h3>
        <h3>Class:KinderGarden</h3>
        <h3>Address:Nohara house</h3>
      </div>
    </div>
  );
};

export default Student1;
