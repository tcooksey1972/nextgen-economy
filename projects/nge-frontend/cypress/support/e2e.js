/**
 * E2E test support file — custom commands for wallet mocking and common assertions.
 */

/**
 * Mock MetaMask / window.ethereum so tests run without a real browser wallet.
 * Injects a fake provider that responds to common RPC calls.
 */
Cypress.Commands.add("mockWallet", (options = {}) => {
  const {
    accounts = ["0x1234567890abcdef1234567890abcdef12345678"],
    chainId = "0xaa36a7", // Sepolia (11155111)
  } = options;

  cy.window().then((win) => {
    const listeners = {};

    win.ethereum = {
      isMetaMask: true,
      selectedAddress: accounts[0],

      request: ({ method, params }) => {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return Promise.resolve(accounts);
          case "eth_chainId":
            return Promise.resolve(chainId);
          case "wallet_switchEthereumChain":
            return Promise.resolve(null);
          case "net_version":
            return Promise.resolve("11155111");
          default:
            return Promise.reject(new Error(`Unhandled method: ${method}`));
        }
      },

      on: (event, handler) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      },

      removeListener: (event, handler) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      },

      emit: (event, ...args) => {
        (listeners[event] || []).forEach((h) => h(...args));
      },
    };
  });
});

/**
 * Visit a page and wait for React to render.
 */
Cypress.Commands.add("visitAndWait", (path) => {
  cy.visit(path);
  cy.get("nav").should("be.visible");
});
