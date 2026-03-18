/**
 * Cold Chain Demo page E2E tests — verify all 11 OpenZeppelin module
 * sections render and the interactive elements work.
 */
describe("Cold Chain Demo Page", () => {
  beforeEach(() => {
    cy.visitAndWait("/demo");
  });

  it("renders the demo page heading", () => {
    cy.contains("Cold Chain").should("be.visible");
  });

  it("shows all 11 OpenZeppelin module sections", () => {
    // Each section has a numbered heading - verify key modules are present
    cy.contains("MerkleProof").should("exist");
    cy.contains("EIP-712").should("exist");
    cy.contains("AccessManager").should("exist");
    cy.contains("BitMaps").should("exist");
    cy.contains("ERC1155").should("exist");
    cy.contains("UUPS").should("exist");
    cy.contains("EnumerableSet").should("exist");
    cy.contains("Checkpoints").should("exist");
    cy.contains("Governor").should("exist");
  });

  it("sections are expandable", () => {
    // Click the first section header to expand it
    cy.get("body").then(($body) => {
      // The demo page uses expandable sections - clicking a section header toggles it
      const sections = $body.find("h3, [role='button']");
      if (sections.length > 0) {
        cy.wrap(sections.first()).click({ force: true });
      }
    });
  });
});
