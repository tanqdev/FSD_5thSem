function sum(a, b) {
  return a + b;
}
function sumWithMsg(callback, msg) {
  const res = callback(20, 30);
  const finalRes = "Hi " + msg + ", your score is " + res;
  console.log(finalRes);
}

console.log(sumWithMsg(sum, "Mr. Deepak"));
