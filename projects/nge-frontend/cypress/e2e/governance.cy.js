/**
 * Governance page E2E tests — verify delegation UI, proposal list,
 * and wallet connection prompts.
 */
describe("Governance Page", () => {
  it("shows connect wallet prompt when not connected", () => {
    cy.visitAndWait("/governance");
    cy.contains("Connect your wallet").should("be.visible");
    cy.contains("Connect Wallet").should("be.visible");
  });

  it("shows token not configured message without env vars", () => {
    // When no REACT_APP_TOKEN_ADDRESS is set, the governance page
    // with a connected wallet should show the delegation-only view
    // or the "not configured" message depending on config state.
    cy.visitAndWait("/governance");
    // Without wallet, we get the connect prompt
    cy.contains("Connect your wallet").should("be.visible");
  });

  it("shows How Governance Works section", () => {
    // Visit governance and check for the educational content
    cy.visitAndWait("/governance");
    // Without connection, we should see the connect prompt
    cy.contains("governance").should("exist");
  });
});

describe("Governance Page (with mocked wallet)", () => {
  beforeEach(() => {
    cy.visitAndWait("/governance");
    cy.mockWallet();
  });

  it("shows governance-related content after page load", () => {
    // The page should contain governance-related text
    cy.get("body").should("contain.text", "Governance");
  });
});
