module.exports = {
  // Focus coverage on the AMM under test; mocks/harnesses are test infrastructure.
  skipFiles: ["MockERC20.sol", "test/MathHarness.sol"],
};
