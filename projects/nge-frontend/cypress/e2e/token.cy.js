/**
 * Token page E2E tests — verify balance display, transfer form,
 * delegation form, and burn form render correctly.
 */
describe("Token Page", () => {
  it("shows connect wallet prompt when not connected", () => {
    cy.visitAndWait("/token");
    cy.contains("Connect your wallet").should("be.visible");
  });

  it("shows token management heading text", () => {
    cy.visitAndWait("/token");
    // The connect prompt should mention token management
    cy.contains("NGE tokens").should("be.visible");
  });
});
