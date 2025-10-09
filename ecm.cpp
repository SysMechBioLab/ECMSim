#include <cstdlib>
#include <cstring>
#include <ctime>
#include <emscripten.h>
#include <string>
#include <unordered_map>
#include <vector>

const int GRID_SIZE = 100;

// Define rate constants for the ODE system
struct RateConstants {
  double k_input = 1.0;       // Input signal rate
  double k_feedback = 0.5;    // Feedback signal rate
  double k_degradation = 0.1; // Natural degradation rate
  double k_receptor = 2.0;    // Receptor activation rate
  double k_inhibition = 0.5;  // Inhibitory effect rate
  double k_activation = 1.0;  // Activation rate
  double k_production = 0.01; // ECM production rate
  double k_diffusion = 0.25;   // Diffusion rate for feedback molecules *****
  double time_step = 0.1;     // Default time step for integration
};

RateConstants rates;

struct Cell {
  std::unordered_map<std::string, double> icm;       // Current values
  std::unordered_map<std::string, double> icm_rates; // Rate of change (dx/dt)
  std::unordered_map<std::string, double> ecm;       // ECM components
  std::unordered_map<std::string, double> ecm_rates; // ECM rate of change
  std::unordered_map<std::string, double> feedback;  // Feedback mechanisms
  std::unordered_map<std::string, double>
      feedback_rates; // Feedback rate of change
  
  // Add per-cell input overrides
  std::unordered_map<std::string, double> input_overrides; // Per-cell input values
  bool has_input_override = false; // Flag to indicate if this cell has custom inputs
};

std::vector<std::vector<Cell>> grid(GRID_SIZE, std::vector<Cell>(GRID_SIZE));

extern "C" {

// Initialize all molecules in the grid
EMSCRIPTEN_KEEPALIVE
void initializeGrid() {
  // Seed the random number generator
  srand(time(NULL));

  for (int i = 0; i < GRID_SIZE; i++) {
    for (int j = 0; j < GRID_SIZE; j++) {
      grid[i][j].icm.clear();
      grid[i][j].icm_rates.clear();
      grid[i][j].ecm.clear();
      grid[i][j].ecm_rates.clear();
      grid[i][j].feedback.clear();
      grid[i][j].feedback_rates.clear();
      grid[i][j].input_overrides.clear();
      grid[i][j].has_input_override = false;

      // Initialize input molecules with default values
      grid[i][j].icm["AngIIin"] = 0;
      grid[i][j].icm["TGFBin"] = 0;
      grid[i][j].icm["tensionin"] = 0;
      grid[i][j].icm["IL6in"] = 0;
      grid[i][j].icm["IL1in"] = 0;
      grid[i][j].icm["TNFain"] = 0;
      grid[i][j].icm["NEin"] = 0;
      grid[i][j].icm["PDGFin"] = 0;
      grid[i][j].icm["ET1in"] = 0;
      grid[i][j].icm["NPin"] = 0;
      grid[i][j].icm["E2in"] = 0;

      // Initialize feedback molecules
      grid[i][j].feedback["TGFBfb"] = 0;
      grid[i][j].feedback["AngIIfb"] = 0;
      grid[i][j].feedback["IL6fb"] = 0;
      grid[i][j].feedback["ET1fb"] = 0;
      grid[i][j].feedback["tensionfb"] = 0;

      // Initialize ECM molecules with random values (0.0-0.9)
      grid[i][j].ecm["proCI"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["proCIII"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["fibronectin"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["periostin"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["TNC"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["PAI1"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["CTGF"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["EDAFN"] = (rand() % 10) / 10.0;

      // Initialize MMPs and TIMPs
      grid[i][j].ecm["proMMP1"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["proMMP2"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["proMMP3"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["proMMP8"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["proMMP9"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["proMMP12"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["proMMP14"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["TIMP1"] = (rand() % 10) / 10.0;
      grid[i][j].ecm["TIMP2"] = (rand() % 10) / 10.0;

      // Initialize all rate arrays with zeros
      for (const auto &[key, val] : grid[i][j].icm) {
        grid[i][j].icm_rates[key] = 0.0;
      }

      for (const auto &[key, val] : grid[i][j].ecm) {
        grid[i][j].ecm_rates[key] = 0.0;
      }

      for (const auto &[key, val] : grid[i][j].feedback) {
        grid[i][j].feedback_rates[key] = 0.0;
      }

      // Initialize other variables needed for calculations
      grid[i][j].icm["AngII"] = 0;
      grid[i][j].icm_rates["AngII"] = 0;

      grid[i][j].icm["TGFB"] = 0;
      grid[i][j].icm_rates["TGFB"] = 0;

      grid[i][j].icm["tension"] = 0;
      grid[i][j].icm_rates["tension"] = 0;

      grid[i][j].icm["IL6"] = 0;
      grid[i][j].icm_rates["IL6"] = 0;

      grid[i][j].icm["IL1"] = 0;
      grid[i][j].icm_rates["IL1"] = 0;

      grid[i][j].icm["TNFa"] = 0;
      grid[i][j].icm_rates["TNFa"] = 0;

      grid[i][j].icm["NE"] = 0;
      grid[i][j].icm_rates["NE"] = 0;

      grid[i][j].icm["PDGF"] = 0;
      grid[i][j].icm_rates["PDGF"] = 0;

      grid[i][j].icm["ET1"] = 0;
      grid[i][j].icm_rates["ET1"] = 0;

      grid[i][j].icm["NP"] = 0;
      grid[i][j].icm_rates["NP"] = 0;

      grid[i][j].icm["E2"] = 0;
      grid[i][j].icm_rates["E2"] = 0;

      // Initialize all receptor variables and their rates
      grid[i][j].icm["AT1R"] = 0;
      grid[i][j].icm_rates["AT1R"] = 0;

      grid[i][j].icm["TGFB1R"] = 0;
      grid[i][j].icm_rates["TGFB1R"] = 0;

      grid[i][j].icm["ETAR"] = 0;
      grid[i][j].icm_rates["ETAR"] = 0;

      grid[i][j].icm["IL1RI"] = 0;
      grid[i][j].icm_rates["IL1RI"] = 0;

      grid[i][j].icm["PDGFR"] = 0;
      grid[i][j].icm_rates["PDGFR"] = 0;

      grid[i][j].icm["TNFaR"] = 0;
      grid[i][j].icm_rates["TNFaR"] = 0;

      grid[i][j].icm["NPRA"] = 0;
      grid[i][j].icm_rates["NPRA"] = 0;

      grid[i][j].icm["gp130"] = 0;
      grid[i][j].icm_rates["gp130"] = 0;

      grid[i][j].icm["BAR"] = 0;
      grid[i][j].icm_rates["BAR"] = 0;

      grid[i][j].icm["AT2R"] = 0;
      grid[i][j].icm_rates["AT2R"] = 0;

      // Initialize second messengers and their rates
      grid[i][j].icm["NOX"] = 0;
      grid[i][j].icm_rates["NOX"] = 0;

      grid[i][j].icm["ROS"] = 0;
      grid[i][j].icm_rates["ROS"] = 0;

      grid[i][j].icm["DAG"] = 0;
      grid[i][j].icm_rates["DAG"] = 0;

      grid[i][j].icm["AC"] = 0;
      grid[i][j].icm_rates["AC"] = 0;

      grid[i][j].icm["cAMP"] = 0;
      grid[i][j].icm_rates["cAMP"] = 0;

      grid[i][j].icm["cGMP"] = 0;
      grid[i][j].icm_rates["cGMP"] = 0;

      grid[i][j].icm["Ca"] = 0;
      grid[i][j].icm_rates["Ca"] = 0;

      grid[i][j].icm["TRPC"] = 0;
      grid[i][j].icm_rates["TRPC"] = 0;

      // Initialize all kinases, phosphatases, and their rates
      grid[i][j].icm["PKA"] = 0;
      grid[i][j].icm_rates["PKA"] = 0;

      grid[i][j].icm["PKG"] = 0;
      grid[i][j].icm_rates["PKG"] = 0;

      grid[i][j].icm["PKC"] = 0;
      grid[i][j].icm_rates["PKC"] = 0;

      grid[i][j].icm["calcineurin"] = 0;
      grid[i][j].icm_rates["calcineurin"] = 0;

      grid[i][j].icm["PP1"] = 0;
      grid[i][j].icm_rates["PP1"] = 0;

      // Initialize transcription factors and their rates
      grid[i][j].icm["CREB"] = 0;
      grid[i][j].icm_rates["CREB"] = 0;

      grid[i][j].icm["CBP"] = 0;
      grid[i][j].icm_rates["CBP"] = 0;

      grid[i][j].icm["NFAT"] = 0;
      grid[i][j].icm_rates["NFAT"] = 0;

      grid[i][j].icm["AP1"] = 0;
      grid[i][j].icm_rates["AP1"] = 0;

      grid[i][j].icm["STAT"] = 0;
      grid[i][j].icm_rates["STAT"] = 0;

      grid[i][j].icm["NFKB"] = 0;
      grid[i][j].icm_rates["NFKB"] = 0;

      grid[i][j].icm["SRF"] = 0;
      grid[i][j].icm_rates["SRF"] = 0;

      grid[i][j].icm["MRTF"] = 0;
      grid[i][j].icm_rates["MRTF"] = 0;

      // Initialize MAPK pathway components and their rates
      grid[i][j].icm["Ras"] = 0;
      grid[i][j].icm_rates["Ras"] = 0;

      grid[i][j].icm["Raf"] = 0;
      grid[i][j].icm_rates["Raf"] = 0;

      grid[i][j].icm["MEK1"] = 0;
      grid[i][j].icm_rates["MEK1"] = 0;

      grid[i][j].icm["ERK"] = 0;
      grid[i][j].icm_rates["ERK"] = 0;

      grid[i][j].icm["p38"] = 0;
      grid[i][j].icm_rates["p38"] = 0;

      grid[i][j].icm["JNK"] = 0;
      grid[i][j].icm_rates["JNK"] = 0;

      grid[i][j].icm["MKK3"] = 0;
      grid[i][j].icm_rates["MKK3"] = 0;

      grid[i][j].icm["MKK4"] = 0;
      grid[i][j].icm_rates["MKK4"] = 0;

      grid[i][j].icm["MEKK1"] = 0;
      grid[i][j].icm_rates["MEKK1"] = 0;

      grid[i][j].icm["ASK1"] = 0;
      grid[i][j].icm_rates["ASK1"] = 0;

      grid[i][j].icm["TRAF"] = 0;
      grid[i][j].icm_rates["TRAF"] = 0;

      // Initialize PI3K-Akt-mTOR pathway components and their rates
      grid[i][j].icm["PI3K"] = 0;
      grid[i][j].icm_rates["PI3K"] = 0;

      grid[i][j].icm["Akt"] = 0;
      grid[i][j].icm_rates["Akt"] = 0;

      grid[i][j].icm["mTORC1"] = 0;
      grid[i][j].icm_rates["mTORC1"] = 0;

      grid[i][j].icm["mTORC2"] = 0;
      grid[i][j].icm_rates["mTORC2"] = 0;

      grid[i][j].icm["p70S6K"] = 0;
      grid[i][j].icm_rates["p70S6K"] = 0;

      grid[i][j].icm["EBP1"] = 0;
      grid[i][j].icm_rates["EBP1"] = 0;

      // Initialize Rho/ROCK pathway components and their rates
      grid[i][j].icm["Rho"] = 0;
      grid[i][j].icm_rates["Rho"] = 0;

      grid[i][j].icm["ROCK"] = 0;
      grid[i][j].icm_rates["ROCK"] = 0;

      grid[i][j].icm["RhoGEF"] = 0;
      grid[i][j].icm_rates["RhoGEF"] = 0;

      grid[i][j].icm["RhoGDI"] = 0;
      grid[i][j].icm_rates["RhoGDI"] = 0;

      // Initialize cytoskeleton and adhesion components and their rates
      grid[i][j].icm["Factin"] = 0;
      grid[i][j].icm_rates["Factin"] = 0;

      grid[i][j].icm["Gactin"] = 1.0; // Start with 100% G-actin
      grid[i][j].icm_rates["Gactin"] = 0;

      grid[i][j].icm["B1int"] = 0;
      grid[i][j].icm_rates["B1int"] = 0;

      grid[i][j].icm["B3int"] = 0;
      grid[i][j].icm_rates["B3int"] = 0;

      grid[i][j].icm["FAK"] = 0;
      grid[i][j].icm_rates["FAK"] = 0;

      grid[i][j].icm["Src"] = 0;
      grid[i][j].icm_rates["Src"] = 0;

      grid[i][j].icm["Grb2"] = 0;
      grid[i][j].icm_rates["Grb2"] = 0;

      grid[i][j].icm["p130Cas"] = 0;
      grid[i][j].icm_rates["p130Cas"] = 0;

      grid[i][j].icm["Rac1"] = 0;
      grid[i][j].icm_rates["Rac1"] = 0;

      grid[i][j].icm["abl"] = 0;
      grid[i][j].icm_rates["abl"] = 0;

      grid[i][j].icm["talin"] = 0;
      grid[i][j].icm_rates["talin"] = 0;

      grid[i][j].icm["vinculin"] = 0;
      grid[i][j].icm_rates["vinculin"] = 0;

      grid[i][j].icm["paxillin"] = 0;
      grid[i][j].icm_rates["paxillin"] = 0;

      grid[i][j].icm["FA"] = 0;
      grid[i][j].icm_rates["FA"] = 0;

      grid[i][j].icm["MLC"] = 0;
      grid[i][j].icm_rates["MLC"] = 0;

      grid[i][j].icm["contractility"] = 0;
      grid[i][j].icm_rates["contractility"] = 0;

      // Initialize YAP/TAZ signaling components and their rates
      grid[i][j].icm["YAP"] = 0;
      grid[i][j].icm_rates["YAP"] = 0;

      // Initialize estrogen signaling components and their rates
      grid[i][j].icm["ERX"] = 0;
      grid[i][j].icm_rates["ERX"] = 0;

      grid[i][j].icm["ERB"] = 0;
      grid[i][j].icm_rates["ERB"] = 0;

      grid[i][j].icm["GPR30"] = 0;
      grid[i][j].icm_rates["GPR30"] = 0;

      grid[i][j].icm["CyclinB1"] = 0;
      grid[i][j].icm_rates["CyclinB1"] = 0;

      grid[i][j].icm["CDK1"] = 0;
      grid[i][j].icm_rates["CDK1"] = 0;

      // Initialize additional components and their rates
      grid[i][j].icm["AGT"] = 0;
      grid[i][j].icm_rates["AGT"] = 0;

      grid[i][j].icm["ACE"] = 0;
      grid[i][j].icm_rates["ACE"] = 0;

      grid[i][j].icm["BAMBI"] = 0;
      grid[i][j].icm_rates["BAMBI"] = 0;

      grid[i][j].icm["smad3"] = 0;
      grid[i][j].icm_rates["smad3"] = 0;

      grid[i][j].icm["smad7"] = 0;
      grid[i][j].icm_rates["smad7"] = 0;

      grid[i][j].icm["epac"] = 0;
      grid[i][j].icm_rates["epac"] = 0;

      grid[i][j].icm["cmyc"] = 0;
      grid[i][j].icm_rates["cmyc"] = 0;

      grid[i][j].icm["proliferation"] = 0;
      grid[i][j].icm_rates["proliferation"] = 0;

      grid[i][j].icm["latentTGFB"] = 0;
      grid[i][j].icm_rates["latentTGFB"] = 0;

      grid[i][j].icm["thrombospondin4"] = 0;
      grid[i][j].icm_rates["thrombospondin4"] = 0;

      grid[i][j].icm["osteopontin"] = 0;
      grid[i][j].icm_rates["osteopontin"] = 0;

      grid[i][j].icm["syndecan4"] = 0;
      grid[i][j].icm_rates["syndecan4"] = 0;

      grid[i][j].icm["aSMA"] = 0;
      grid[i][j].icm_rates["aSMA"] = 0;

      grid[i][j].icm["LOX"] = 0;
      grid[i][j].icm_rates["LOX"] = 0;
    }
  }
}

// Helper function to get input value for a cell (considering overrides)
double getInputValue(const Cell &cell, const std::string &molecule) {
  if (cell.has_input_override && cell.input_overrides.count(molecule) > 0) {
    return cell.input_overrides.at(molecule);
  }
  return cell.icm.at(molecule);
}

// Calculate rates of change based on ODE rules
void calculateRates(Cell &cell) {
  // Input signals to ligands - ODE form (using helper function for overrides)
  cell.icm_rates["AngII"] = rates.k_input * getInputValue(cell, "AngIIin") +
                            rates.k_feedback * cell.feedback["AngIIfb"] -
                            rates.k_degradation * cell.icm["AngII"];

  cell.icm_rates["TGFB"] = rates.k_input * getInputValue(cell, "TGFBin") +
                           rates.k_feedback * cell.feedback["TGFBfb"] -
                           rates.k_degradation * cell.icm["TGFB"];

  cell.icm_rates["tension"] = rates.k_input * getInputValue(cell, "tensionin") +
                              rates.k_feedback * cell.feedback["tensionfb"] -
                              rates.k_degradation * cell.icm["tension"];

  cell.icm_rates["IL6"] = rates.k_input * getInputValue(cell, "IL6in") +
                          rates.k_feedback * cell.feedback["IL6fb"] -
                          rates.k_degradation * cell.icm["IL6"];

  cell.icm_rates["IL1"] =
      rates.k_input * getInputValue(cell, "IL1in") - rates.k_degradation * cell.icm["IL1"];

  cell.icm_rates["TNFa"] = rates.k_input * getInputValue(cell, "TNFain") -
                           rates.k_degradation * cell.icm["TNFa"];

  cell.icm_rates["NE"] =
      rates.k_input * getInputValue(cell, "NEin") - rates.k_degradation * cell.icm["NE"];

  cell.icm_rates["PDGF"] = rates.k_input * getInputValue(cell, "PDGFin") -
                           rates.k_degradation * cell.icm["PDGF"];

  cell.icm_rates["ET1"] = rates.k_input * getInputValue(cell, "ET1in") +
                          rates.k_feedback * cell.feedback["ET1fb"] -
                          rates.k_degradation * cell.icm["ET1"];

  cell.icm_rates["NP"] =
      rates.k_input * getInputValue(cell, "NPin") - rates.k_degradation * cell.icm["NP"];

  cell.icm_rates["E2"] =
      rates.k_input * getInputValue(cell, "E2in") - rates.k_degradation * cell.icm["E2"];

  // Receptor activation - ODE form with inhibition
  cell.icm_rates["AT1R"] =
      rates.k_receptor * cell.icm["AngII"] -
      rates.k_inhibition * cell.icm["AT1R"] * cell.icm["ERB"] -
      rates.k_degradation * cell.icm["AT1R"];

  cell.icm_rates["TGFB1R"] =
      rates.k_receptor * cell.icm["TGFB"] -
      rates.k_inhibition * cell.icm["TGFB1R"] * cell.icm["BAMBI"] -
      rates.k_degradation * cell.icm["TGFB1R"];

  cell.icm_rates["ETAR"] = rates.k_receptor * cell.icm["ET1"] -
                           rates.k_degradation * cell.icm["ETAR"];

  cell.icm_rates["IL1RI"] = rates.k_receptor * cell.icm["IL1"] -
                            rates.k_degradation * cell.icm["IL1RI"];

  cell.icm_rates["PDGFR"] = rates.k_receptor * cell.icm["PDGF"] -
                            rates.k_degradation * cell.icm["PDGFR"];

  cell.icm_rates["TNFaR"] = rates.k_receptor * cell.icm["TNFa"] -
                            rates.k_degradation * cell.icm["TNFaR"];

  cell.icm_rates["NPRA"] = rates.k_receptor * cell.icm["NP"] -
                           rates.k_degradation * cell.icm["NPRA"];

  cell.icm_rates["gp130"] = rates.k_receptor * cell.icm["IL6"] -
                            rates.k_degradation * cell.icm["gp130"];

  cell.icm_rates["BAR"] =
      rates.k_receptor * cell.icm["NE"] - rates.k_degradation * cell.icm["BAR"];

  cell.icm_rates["AT2R"] = rates.k_receptor * cell.icm["AngII"] -
                           rates.k_degradation * cell.icm["AT2R"];

  // Second messengers - ODE form
  cell.icm_rates["NOX"] =
      rates.k_activation * (cell.icm["AT1R"] + cell.icm["TGFB1R"]) -
      rates.k_degradation * cell.icm["NOX"];

  cell.icm_rates["ROS"] =
      rates.k_activation * (cell.icm["NOX"] + cell.icm["ETAR"]) -
      rates.k_degradation * cell.icm["ROS"];

  cell.icm_rates["DAG"] =
      rates.k_activation * (cell.icm["ETAR"] + cell.icm["AT1R"]) -
      rates.k_degradation * cell.icm["DAG"];

  cell.icm_rates["AC"] =
      rates.k_activation * cell.icm["BAR"] -
      rates.k_inhibition * cell.icm["AC"] * cell.icm["AT1R"] -
      rates.k_degradation * cell.icm["AC"];

  cell.icm_rates["cAMP"] =
      rates.k_activation * (cell.icm["AC"] + cell.icm["ERB"]) -
      rates.k_degradation * cell.icm["cAMP"];

  cell.icm_rates["cGMP"] = rates.k_activation * cell.icm["NPRA"] -
                           rates.k_degradation * cell.icm["cGMP"];

  cell.icm_rates["Ca"] = rates.k_activation * cell.icm["TRPC"] -
                         rates.k_degradation * cell.icm["Ca"];

  // Kinases and phosphatases - ODE form
  cell.icm_rates["PKA"] =
      rates.k_activation * (cell.icm["cAMP"] + cell.icm["ERB"]) -
      rates.k_degradation * cell.icm["PKA"];

  cell.icm_rates["PKG"] = rates.k_activation * cell.icm["cGMP"] -
                          rates.k_degradation * cell.icm["PKG"];

  cell.icm_rates["PKC"] =
      rates.k_activation *
          (cell.icm["DAG"] * cell.icm["mTORC2"] + cell.icm["syndecan4"]) -
      rates.k_degradation * cell.icm["PKC"];

  cell.icm_rates["calcineurin"] = rates.k_activation * cell.icm["Ca"] -
                                  rates.k_degradation * cell.icm["calcineurin"];

  cell.icm_rates["PP1"] = rates.k_activation * cell.icm["p38"] -
                          rates.k_degradation * cell.icm["PP1"];

  // Transcription factors - ODE form
  cell.icm_rates["CREB"] = rates.k_activation * cell.icm["PKA"] -
                           rates.k_degradation * cell.icm["CREB"];

  cell.icm_rates["CBP"] = rates.k_activation * (1.0 - cell.icm["smad3"]) +
                          rates.k_activation * (1.0 - cell.icm["CREB"]) -
                          rates.k_degradation * cell.icm["CBP"];

  cell.icm_rates["NFAT"] = rates.k_activation * cell.icm["calcineurin"] -
                           rates.k_degradation * cell.icm["NFAT"];

  cell.icm_rates["AP1"] =
      rates.k_activation * (cell.icm["ERK"] + cell.icm["JNK"]) -
      rates.k_degradation * cell.icm["AP1"];

  cell.icm_rates["STAT"] = rates.k_activation * cell.icm["gp130"] -
                           rates.k_degradation * cell.icm["STAT"];

  cell.icm_rates["NFKB"] =
      rates.k_activation * cell.icm["IL1RI"] -
      rates.k_inhibition * cell.icm["NFKB"] * cell.icm["ERX"] +
      rates.k_activation * cell.icm["ERK"] -
      rates.k_inhibition * cell.icm["NFKB"] * cell.icm["ERX"] +
      rates.k_activation * cell.icm["p38"] -
      rates.k_inhibition * cell.icm["NFKB"] * cell.icm["ERX"] +
      rates.k_activation * cell.icm["Akt"] -
      rates.k_inhibition * cell.icm["NFKB"] * cell.icm["ERX"] -
      rates.k_degradation * cell.icm["NFKB"];

  cell.icm_rates["SRF"] = rates.k_activation * cell.icm["MRTF"] -
                          rates.k_degradation * cell.icm["SRF"];

  cell.icm_rates["MRTF"] =
      rates.k_activation * cell.icm["NFAT"] -
      rates.k_inhibition * cell.icm["MRTF"] * cell.icm["Gactin"] -
      rates.k_degradation * cell.icm["MRTF"];

  // MAPK pathways - ODE form
  cell.icm_rates["Ras"] =
      rates.k_activation * (cell.icm["AT1R"] + cell.icm["Grb2"]) -
      rates.k_degradation * cell.icm["Ras"];

  cell.icm_rates["Raf"] = rates.k_activation * cell.icm["Ras"] -
                          rates.k_degradation * cell.icm["Raf"];

  cell.icm_rates["MEK1"] =
      rates.k_activation * cell.icm["Raf"] -
      rates.k_inhibition * cell.icm["MEK1"] * cell.icm["ERK"] -
      rates.k_degradation * cell.icm["MEK1"];

  cell.icm_rates["ERK"] =
      rates.k_activation * cell.icm["MEK1"] -
      rates.k_inhibition * cell.icm["ERK"] * cell.icm["PP1"] +
      rates.k_activation * cell.icm["ROS"] -
      rates.k_inhibition * cell.icm["ERK"] * cell.icm["AT2R"] -
      rates.k_degradation * cell.icm["ERK"];

  cell.icm_rates["p38"] =
      rates.k_activation * cell.icm["ROS"] +
      rates.k_activation * cell.icm["MKK3"] +
      rates.k_activation * cell.icm["Ras"] +
      rates.k_activation * cell.icm["Rho"] -
      rates.k_inhibition * cell.icm["p38"] * cell.icm["Rac1"] -
      rates.k_degradation * cell.icm["p38"];

  cell.icm_rates["JNK"] =
      rates.k_activation * cell.icm["ROS"] +
      rates.k_activation * cell.icm["MKK4"] -
      rates.k_inhibition * cell.icm["JNK"] * cell.icm["NFKB"] -
      rates.k_inhibition * cell.icm["JNK"] * cell.icm["Rho"] -
      rates.k_degradation * cell.icm["JNK"];

  cell.icm_rates["MKK3"] = rates.k_activation * cell.icm["ASK1"] -
                           rates.k_degradation * cell.icm["MKK3"];

  cell.icm_rates["MKK4"] =
      rates.k_activation * (cell.icm["MEKK1"] + cell.icm["ASK1"]) -
      rates.k_degradation * cell.icm["MKK4"];

  cell.icm_rates["MEKK1"] =
      rates.k_activation * (cell.icm["FAK"] + cell.icm["Rac1"]) -
      rates.k_degradation * cell.icm["MEKK1"];

  cell.icm_rates["ASK1"] =
      rates.k_activation * (cell.icm["TRAF"] + cell.icm["IL1RI"]) -
      rates.k_degradation * cell.icm["ASK1"];

  cell.icm_rates["TRAF"] =
      rates.k_activation * (cell.icm["TGFB1R"] + cell.icm["TNFaR"]) -
      rates.k_degradation * cell.icm["TRAF"];

  // PI3K-Akt-mTOR pathway - ODE form
  cell.icm_rates["PI3K"] =
      rates.k_activation * (cell.icm["TNFaR"] + cell.icm["TGFB1R"] +
                            cell.icm["PDGFR"] + cell.icm["FAK"]) -
      rates.k_degradation * cell.icm["PI3K"];

  cell.icm_rates["Akt"] =
      rates.k_activation * (cell.icm["PI3K"] * cell.icm["mTORC2"]) +
      rates.k_activation * cell.icm["ERX"] +
      rates.k_activation * cell.icm["GPR30"] -
      rates.k_degradation * cell.icm["Akt"];

  cell.icm_rates["mTORC1"] = rates.k_activation * cell.icm["Akt"] -
                             rates.k_degradation * cell.icm["mTORC1"];

  cell.icm_rates["mTORC2"] =
      rates.k_activation -
      rates.k_inhibition * cell.icm["mTORC2"] * cell.icm["p70S6K"] -
      rates.k_degradation * cell.icm["mTORC2"];

  cell.icm_rates["p70S6K"] = rates.k_activation * cell.icm["mTORC1"] -
                             rates.k_degradation * cell.icm["p70S6K"];

  cell.icm_rates["EBP1"] =
      rates.k_activation -
      rates.k_inhibition * cell.icm["EBP1"] * cell.icm["mTORC1"] -
      rates.k_degradation * cell.icm["EBP1"];

  // Rho/ROCK pathway - ODE form
  cell.icm_rates["Rho"] =
      rates.k_activation * cell.icm["TGFB1R"] +
      rates.k_activation * cell.icm["RhoGEF"] -
      rates.k_inhibition * cell.icm["Rho"] * cell.icm["RhoGDI"] -
      rates.k_inhibition * cell.icm["Rho"] * cell.icm["PKG"] -
      rates.k_degradation * cell.icm["Rho"];

  cell.icm_rates["ROCK"] = rates.k_activation * cell.icm["Rho"] -
                           rates.k_degradation * cell.icm["ROCK"];

  cell.icm_rates["RhoGEF"] =
      rates.k_activation * (cell.icm["FAK"] * cell.icm["Src"]) -
      rates.k_degradation * cell.icm["RhoGEF"];

  cell.icm_rates["RhoGDI"] =
      rates.k_activation -
      rates.k_inhibition * cell.icm["RhoGDI"] * cell.icm["Src"] +
      rates.k_activation * cell.icm["PKA"] + rates.k_activation -
      rates.k_inhibition * cell.icm["RhoGDI"] * cell.icm["PKC"] -
      rates.k_degradation * cell.icm["RhoGDI"];

  // Cytoskeleton and adhesion - ODE form
  cell.icm_rates["Factin"] =
      rates.k_activation * (cell.icm["ROCK"] * cell.icm["Gactin"]) -
      rates.k_degradation * cell.icm["Factin"];

  cell.icm_rates["Gactin"] =
      rates.k_activation -
      rates.k_inhibition * cell.icm["Gactin"] * cell.icm["Factin"] -
      rates.k_degradation * cell.icm["Gactin"];

  cell.icm_rates["B1int"] =
      rates.k_activation * cell.icm["tension"] +
      rates.k_activation * (cell.icm["PKC"] * cell.icm["tension"]) -
      rates.k_degradation * cell.icm["B1int"];

  cell.icm_rates["B3int"] =
      rates.k_activation * cell.icm["tension"] -
      rates.k_inhibition * cell.icm["B3int"] * cell.icm["thrombospondin4"] +
      rates.k_activation * cell.icm["osteopontin"] -
      rates.k_degradation * cell.icm["B3int"];

  cell.icm_rates["FAK"] = rates.k_activation * cell.icm["B1int"] -
                          rates.k_degradation * cell.icm["FAK"];

  cell.icm_rates["Src"] =
      rates.k_activation * (cell.icm["PDGFR"] + cell.icm["B3int"]) -
      rates.k_degradation * cell.icm["Src"];

  cell.icm_rates["Grb2"] =
      rates.k_activation * (cell.icm["FAK"] * cell.icm["Src"]) -
      rates.k_degradation * cell.icm["Grb2"];

  cell.icm_rates["p130Cas"] =
      rates.k_activation * (cell.icm["tension"] * cell.icm["Src"] +
                            cell.icm["FAK"] * cell.icm["Src"]) -
      rates.k_degradation * cell.icm["p130Cas"];

  cell.icm_rates["Rac1"] =
      rates.k_activation * cell.icm["abl"] +
      rates.k_activation * (cell.icm["p130Cas"] * cell.icm["abl"]) -
      rates.k_degradation * cell.icm["Rac1"];

  cell.icm_rates["abl"] = rates.k_activation * cell.icm["PDGFR"] -
                          rates.k_degradation * cell.icm["abl"];

  cell.icm_rates["talin"] =
      rates.k_activation * (cell.icm["B1int"] + cell.icm["B3int"]) -
      rates.k_degradation * cell.icm["talin"];

  cell.icm_rates["vinculin"] =
      rates.k_activation * (cell.icm["contractility"] * cell.icm["talin"]) -
      rates.k_degradation * cell.icm["vinculin"];

  cell.icm_rates["paxillin"] =
      rates.k_activation *
          (cell.icm["FAK"] * cell.icm["Src"] * cell.icm["MLC"]) -
      rates.k_degradation * cell.icm["paxillin"];

  cell.icm_rates["FA"] =
      rates.k_activation * (cell.icm["vinculin"] * cell.icm["CDK1"]) -
      rates.k_inhibition * cell.icm["FA"] * cell.icm["paxillin"] -
      rates.k_degradation * cell.icm["FA"];

  cell.icm_rates["MLC"] = rates.k_activation * cell.icm["ROCK"] -
                          rates.k_degradation * cell.icm["MLC"];

  cell.icm_rates["contractility"] =
      rates.k_activation * (cell.icm["Factin"] * cell.icm["MLC"] +
                            cell.icm["aSMA"] * cell.icm["MLC"]) -
      rates.k_degradation * cell.icm["contractility"];

  // YAP/TAZ signaling - ODE form
  cell.icm_rates["YAP"] =
      rates.k_activation * (cell.icm["AT1R"] + cell.icm["Factin"]) -
      rates.k_degradation * cell.icm["YAP"];

  // Estrogen signaling - ODE form
  cell.icm_rates["ERX"] = rates.k_activation * cell.icm["E2"] -
                          rates.k_degradation * cell.icm["ERX"];

  cell.icm_rates["ERB"] = rates.k_activation * cell.icm["E2"] -
                          rates.k_degradation * cell.icm["ERB"];

  cell.icm_rates["GPR30"] = rates.k_activation * cell.icm["E2"] -
                            rates.k_degradation * cell.icm["GPR30"];

  cell.icm_rates["CyclinB1"] =
      rates.k_activation -
      rates.k_inhibition * cell.icm["CyclinB1"] * cell.icm["GPR30"] -
      rates.k_degradation * cell.icm["CyclinB1"];

  cell.icm_rates["CDK1"] =
      rates.k_activation * (cell.icm["CyclinB1"] * cell.icm["AngII"]) -
      rates.k_degradation * cell.icm["CDK1"];

  // Additional components needed for calculations
  cell.icm_rates["AGT"] = rates.k_activation * (1.0 - cell.icm["AT1R"]) *
                              (1.0 - cell.icm["JNK"]) * cell.icm["p38"] -
                          rates.k_degradation * cell.icm["AGT"];

  cell.icm_rates["ACE"] = rates.k_activation * cell.icm["TGFB1R"] -
                          rates.k_degradation * cell.icm["ACE"];

  cell.icm_rates["BAMBI"] =
      rates.k_activation * (cell.icm["TGFB"] * cell.icm["IL1RI"]) -
      rates.k_degradation * cell.icm["BAMBI"];

  cell.icm_rates["smad3"] =
      rates.k_activation * cell.icm["TGFB1R"] -
      rates.k_inhibition * cell.icm["smad3"] * cell.icm["smad7"] -
      rates.k_inhibition * cell.icm["smad3"] * cell.icm["PKG"] -
      rates.k_inhibition * cell.icm["smad3"] * cell.icm["ERB"] +
      rates.k_activation * cell.icm["Akt"] -
      rates.k_degradation * cell.icm["smad3"];

  cell.icm_rates["smad7"] =
      rates.k_activation * cell.icm["STAT"] +
      rates.k_activation * cell.icm["AP1"] -
      rates.k_inhibition * cell.icm["smad7"] * cell.icm["YAP"] -
      rates.k_degradation * cell.icm["smad7"];

  cell.icm_rates["epac"] = rates.k_activation * cell.icm["cAMP"] -
                           rates.k_degradation * cell.icm["epac"];

  cell.icm_rates["cmyc"] = rates.k_activation * cell.icm["JNK"] -
                           rates.k_degradation * cell.icm["cmyc"];

  cell.icm_rates["proliferation"] =
      rates.k_activation *
          (cell.icm["CDK1"] + cell.icm["AP1"] + cell.icm["CREB"] +
            cell.icm["CTGF"] + cell.icm["PKC"] + cell.icm["p70S6K"]) -
      rates.k_inhibition * cell.icm["proliferation"] * cell.icm["EBP1"] +
      rates.k_activation * cell.icm["cmyc"] -
      rates.k_degradation * cell.icm["proliferation"];

  cell.icm_rates["latentTGFB"] = rates.k_activation * cell.icm["AP1"] -
                                 rates.k_degradation * cell.icm["latentTGFB"];

  cell.icm_rates["thrombospondin4"] =
      rates.k_activation * cell.icm["smad3"] -
      rates.k_degradation * cell.icm["thrombospondin4"];

  cell.icm_rates["osteopontin"] = rates.k_activation * cell.icm["AP1"] -
                                  rates.k_degradation * cell.icm["osteopontin"];

  cell.icm_rates["syndecan4"] =
      rates.k_activation * cell.icm["tension"] -
      rates.k_inhibition * cell.icm["syndecan4"] * cell.icm["TNC"] -
      rates.k_degradation * cell.icm["syndecan4"];

  cell.icm_rates["aSMA"] =
      rates.k_activation *
          (cell.icm["YAP"] + cell.icm["smad3"] * cell.icm["CBP"] +
            cell.icm["SRF"]) -
      rates.k_degradation * cell.icm["aSMA"];

  cell.icm_rates["LOX"] = rates.k_activation * cell.icm["Akt"] -
                          rates.k_degradation * cell.icm["LOX"];

  // ECM production rates based on intracellular signaling - ODE form
  cell.icm_rates["proCI"] =
      rates.k_activation * cell.icm["SRF"] +
      rates.k_activation * (cell.icm["smad3"] * cell.icm["CBP"]) -
      rates.k_inhibition * cell.icm["proCI"] * cell.icm["epac"] -
      rates.k_degradation * cell.icm["proCI"];

  cell.icm_rates["proCIII"] =
      rates.k_activation * cell.icm["SRF"] +
      rates.k_activation * (cell.icm["smad3"] * cell.icm["CBP"]) -
      rates.k_inhibition * cell.icm["proCIII"] * cell.icm["epac"] -
      rates.k_degradation * cell.icm["proCIII"];

  cell.icm_rates["fibronectin"] =
      rates.k_activation * (cell.icm["smad3"] * cell.icm["CBP"]) +
      rates.k_activation * cell.icm["NFKB"] -
      rates.k_degradation * cell.icm["fibronectin"];

  cell.icm_rates["periostin"] =
      rates.k_activation * (cell.icm["smad3"] * cell.icm["CBP"]) +
      rates.k_activation * (cell.icm["CREB"] * cell.icm["CBP"]) -
      rates.k_degradation * cell.icm["periostin"];

  cell.icm_rates["TNC"] =
      rates.k_activation * (cell.icm["NFKB"] + cell.icm["MRTF"]) -
      rates.k_degradation * cell.icm["TNC"];

  cell.icm_rates["PAI1"] =
      rates.k_activation * (cell.icm["smad3"] + cell.icm["YAP"]) -
      rates.k_degradation * cell.icm["PAI1"];

  cell.icm_rates["CTGF"] =
      rates.k_activation *
          (cell.icm["smad3"] * cell.icm["CBP"] * cell.icm["ERK"]) +
      rates.k_activation * cell.icm["YAP"] -
      rates.k_degradation * cell.icm["CTGF"];

  cell.icm_rates["EDAFN"] = rates.k_activation * cell.icm["NFAT"] -
                            rates.k_degradation * cell.icm["EDAFN"];

  // MMPs and TIMPs - ODE form
  cell.icm_rates["proMMP1"] =
      rates.k_activation * (cell.icm["NFKB"] * cell.icm["AP1"]) -
      rates.k_inhibition * cell.icm["proMMP1"] * cell.icm["smad3"] -
      rates.k_degradation * cell.icm["proMMP1"];

  cell.icm_rates["proMMP2"] =
      rates.k_activation * (cell.icm["AP1"] + cell.icm["STAT"]) -
      rates.k_degradation * cell.icm["proMMP2"];

  cell.icm_rates["proMMP3"] =
      rates.k_activation * (cell.icm["NFKB"] * cell.icm["AP1"]) -
      rates.k_inhibition * cell.icm["proMMP3"] * cell.icm["smad3"] -
      rates.k_degradation * cell.icm["proMMP3"];

  cell.icm_rates["proMMP8"] =
      rates.k_activation * (cell.icm["NFKB"] * cell.icm["AP1"]) -
      rates.k_inhibition * cell.icm["proMMP8"] * cell.icm["smad3"] -
      rates.k_degradation * cell.icm["proMMP8"];

  cell.icm_rates["proMMP9"] =
      rates.k_activation *
          (cell.icm["STAT"] + cell.icm["NFKB"] * cell.icm["AP1"]) -
      rates.k_degradation * cell.icm["proMMP9"];

  cell.icm_rates["proMMP12"] = rates.k_activation * cell.icm["CREB"] -
                               rates.k_degradation * cell.icm["proMMP12"];

  cell.icm_rates["proMMP14"] =
      rates.k_activation * (cell.icm["AP1"] + cell.icm["NFKB"]) -
      rates.k_degradation * cell.icm["proMMP14"];

  cell.icm_rates["TIMP1"] = rates.k_activation * cell.icm["AP1"] -
                            rates.k_degradation * cell.icm["TIMP1"];

  cell.icm_rates["TIMP2"] = rates.k_activation * cell.icm["AP1"] -
                            rates.k_degradation * cell.icm["TIMP2"];

  // Feedback mechanisms - ODE form
  cell.feedback_rates["TGFBfb"] =
      rates.k_activation * (cell.icm["proMMP9"] * cell.icm["latentTGFB"] +
                            cell.icm["proMMP2"] * cell.icm["latentTGFB"] +
                            cell.icm["tension"] * cell.icm["latentTGFB"]) -
      rates.k_degradation * cell.feedback["TGFBfb"];

  cell.feedback_rates["AngIIfb"] =
      rates.k_activation * (cell.icm["ACE"] * cell.icm["AGT"]) -
      rates.k_degradation * cell.feedback["AngIIfb"];

  cell.feedback_rates["IL6fb"] =
      rates.k_activation * (cell.icm["CREB"] * cell.icm["CBP"] +
                            cell.icm["NFKB"] + cell.icm["AP1"]) -
      rates.k_degradation * cell.feedback["IL6fb"];

  cell.feedback_rates["ET1fb"] = rates.k_activation * cell.icm["AP1"] -
                                 rates.k_degradation * cell.feedback["ET1fb"];

  cell.feedback_rates["tensionfb"] =
      rates.k_activation * (cell.icm["FA"] * cell.icm["contractility"]) -
      rates.k_degradation * cell.feedback["tensionfb"];

  // ECM production rates - ODE form
  cell.ecm_rates["proCI"] = rates.k_production * cell.icm["proCI"] -
                            rates.k_degradation * 0.01 * cell.ecm["proCI"];

  cell.ecm_rates["proCIII"] = rates.k_production * cell.icm["proCIII"] -
                              rates.k_degradation * 0.01 * cell.ecm["proCIII"];

  cell.ecm_rates["proMMP1"] = rates.k_production * cell.icm["proMMP1"] -
                              rates.k_degradation * 0.01 * cell.ecm["proMMP1"];

  cell.ecm_rates["proMMP2"] = rates.k_production * cell.icm["proMMP2"] -
                              rates.k_degradation * 0.01 * cell.ecm["proMMP2"];

  cell.ecm_rates["proMMP3"] = rates.k_production * cell.icm["proMMP3"] -
                              rates.k_degradation * 0.01 * cell.ecm["proMMP3"];

  cell.ecm_rates["proMMP8"] = rates.k_production * cell.icm["proMMP8"] -
                              rates.k_degradation * 0.01 * cell.ecm["proMMP8"];

  cell.ecm_rates["proMMP9"] = rates.k_production * cell.icm["proMMP9"] -
                              rates.k_degradation * 0.01 * cell.ecm["proMMP9"];

  cell.ecm_rates["proMMP12"] =
      rates.k_production * cell.icm["proMMP12"] -
      rates.k_degradation * 0.01 * cell.ecm["proMMP12"];

  cell.ecm_rates["proMMP14"] =
      rates.k_production * cell.icm["proMMP14"] -
      rates.k_degradation * 0.01 * cell.ecm["proMMP14"];

  cell.ecm_rates["TIMP1"] = rates.k_production * cell.icm["TIMP1"] -
                            rates.k_degradation * 0.01 * cell.ecm["TIMP1"];

  cell.ecm_rates["TIMP2"] = rates.k_production * cell.icm["TIMP2"] -
                            rates.k_degradation * 0.01 * cell.ecm["TIMP2"];

  cell.ecm_rates["fibronectin"] =
      rates.k_production * cell.icm["fibronectin"] -
      rates.k_degradation * 0.01 * cell.ecm["fibronectin"];

  cell.ecm_rates["periostin"] =
      rates.k_production * cell.icm["periostin"] -
      rates.k_degradation * 0.01 * cell.ecm["periostin"];

  cell.ecm_rates["TNC"] = rates.k_production * cell.icm["TNC"] -
                          rates.k_degradation * 0.01 * cell.ecm["TNC"];

  cell.ecm_rates["PAI1"] = rates.k_production * cell.icm["PAI1"] -
                           rates.k_degradation * 0.01 * cell.ecm["PAI1"];

  cell.ecm_rates["CTGF"] = rates.k_production * cell.icm["CTGF"] -
                           rates.k_degradation * 0.01 * cell.ecm["CTGF"];

  cell.ecm_rates["EDAFN"] = rates.k_production * cell.icm["EDAFN"] -
                            rates.k_degradation * 0.01 * cell.ecm["EDAFN"];
}

// Update cell state using Euler integration
void updateCell(Cell &cell, double delta_t) {
  // Calculate rates of change
  calculateRates(cell);

  // Update intracellular molecules using Euler method
  for (auto &[key, rate] : cell.icm_rates) {
    cell.icm[key] += rate * delta_t;

    // Ensure values stay within bounds
    if (cell.icm[key] < 0.0)
      cell.icm[key] = 0.0;
    if (cell.icm[key] > 1.0)
      cell.icm[key] = 1.0;
  }

  // Update ECM molecules using Euler method
  for (auto &[key, rate] : cell.ecm_rates) {
    cell.ecm[key] += rate * delta_t;

    // Ensure values stay within bounds
    if (cell.ecm[key] < 0.0)
      cell.ecm[key] = 0.0;
    if (cell.ecm[key] > 1.0)
      cell.ecm[key] = 1.0;
  }

  // Update feedback molecules using Euler method
  for (auto &[key, rate] : cell.feedback_rates) {
    cell.feedback[key] += rate * delta_t;

    // Ensure values stay within bounds
    if (cell.feedback[key] < 0.0)
      cell.feedback[key] = 0.0;
    if (cell.feedback[key] > 1.0)
      cell.feedback[key] = 1.0;
  }
}

// Fixed diffusion function to handle boundary effects properly
void diffuseFeedbackMolecules(double delta_t) {
    // Create a temporary copy of the grid for diffusion calculations
    auto temp_grid = grid;

    // Diffuse feedback molecules using a simple diffusion equation
    for (int i = 0; i < GRID_SIZE; i++) {
        for (int j = 0; j < GRID_SIZE; j++) {
            for (auto &[key, val] : grid[i][j].feedback) {
                double laplacian = 0.0;
                int neighbor_count = 0;

                // Calculate Laplacian with proper boundary handling
                for (int di = -1; di <= 1; di++) {
                    for (int dj = -1; dj <= 1; dj++) {
                        if (di == 0 && dj == 0) continue; // Skip the center cell
                        
                        int ni = i + di;
                        int nj = j + dj;
                        
                        // Handle boundaries with periodic boundary conditions
                        if (ni < 0) ni = GRID_SIZE - 1;
                        if (ni >= GRID_SIZE) ni = 0;
                        if (nj < 0) nj = GRID_SIZE - 1;
                        if (nj >= GRID_SIZE) nj = 0;
                        
                        laplacian += temp_grid[ni][nj].feedback[key] - temp_grid[i][j].feedback[key];
                        neighbor_count++;
                    }
                }

                // Update value using diffusion equation: dC/dt = D * ∇²C
                grid[i][j].feedback[key] += rates.k_diffusion * laplacian * delta_t;
                
                // Ensure values stay within bounds
                if (grid[i][j].feedback[key] < 0.0)
                    grid[i][j].feedback[key] = 0.0;
                if (grid[i][j].feedback[key] > 1.0)
                    grid[i][j].feedback[key] = 1.0;
            }
        }
    }
}

// Fixed diffusion function for ECM molecules
void diffuseECMMolecules(double delta_t) {
    // Create a temporary copy of the grid for diffusion calculations
    auto temp_grid = grid;

    // Diffuse ECM molecules using a simple diffusion equation
    for (int i = 0; i < GRID_SIZE; i++) {
        for (int j = 0; j < GRID_SIZE; j++) {
            for (auto &[key, val] : grid[i][j].ecm) {
                double laplacian = 0.0;
                int neighbor_count = 0;

                // Calculate Laplacian with proper boundary handling
                for (int di = -1; di <= 1; di++) {
                    for (int dj = -1; dj <= 1; dj++) {
                        if (di == 0 && dj == 0) continue; // Skip the center cell
                        
                        int ni = i + di;
                        int nj = j + dj;
                        
                        // Handle boundaries with periodic boundary conditions
                        if (ni < 0) ni = GRID_SIZE - 1;
                        if (ni >= GRID_SIZE) ni = 0;
                        if (nj < 0) nj = GRID_SIZE - 1;
                        if (nj >= GRID_SIZE) nj = 0;
                        
                        laplacian += temp_grid[ni][nj].ecm[key] - temp_grid[i][j].ecm[key];
                        neighbor_count++;
                    }
                }

                // Update value using diffusion equation: dC/dt = D * ∇²C
                // Use a lower diffusion rate for ECM molecules
                grid[i][j].ecm[key] += (rates.k_diffusion * 0.2) * laplacian * delta_t; // Diffusion value of ECM molecules 20% of the fb molecule diffusion rate
                
                // Ensure values stay within bounds
                if (grid[i][j].ecm[key] < 0.0)
                    grid[i][j].ecm[key] = 0.0;
                if (grid[i][j].ecm[key] > 1.0)
                    grid[i][j].ecm[key] = 1.0;
            }
        }
    }
}

// Simulation step with variable time step (fixed version)
EMSCRIPTEN_KEEPALIVE
void simulateStep(double delta_t = 0.1) {
    // Update all cells with ODE integration
    for (auto &row : grid) {
        for (auto &cell : row) {
            updateCell(cell, delta_t);
        }
    }

    // Diffuse feedback molecules between cells
    diffuseFeedbackMolecules(delta_t);
    
    // Diffuse ECM molecules between cells
    diffuseECMMolecules(delta_t);
}

// Functions for getting ECM data - returns array of values for a specific molecule
EMSCRIPTEN_KEEPALIVE
double *getECMData(int molecule_index) {
  double *result = (double *)malloc(GRID_SIZE * GRID_SIZE * sizeof(double));

  // Map molecule index to string key
  std::string molecule;
  switch (molecule_index) {
  case 0:
    molecule = "proCI";
    break;
  case 1:
    molecule = "proCIII";
    break;
  case 2:
    molecule = "fibronectin";
    break;
  case 3:
    molecule = "periostin";
    break;
  case 4:
    molecule = "TNC";
    break;
  case 5:
    molecule = "PAI1";
    break;
  case 6:
    molecule = "CTGF";
    break;
  case 7:
    molecule = "EDAFN";
    break;
  case 8:
    molecule = "TIMP1";
    break;
  case 9:
    molecule = "TIMP2";
    break;
  case 10:
    molecule = "proMMP1";
    break;
  case 11:
    molecule = "proMMP2";
    break;
  case 12:
    molecule = "proMMP3";
    break;
  case 13:
    molecule = "proMMP8";
    break;
  case 14:
    molecule = "proMMP9";
    break;
  case 15:
    molecule = "proMMP12";
    break;
  case 16:
    molecule = "proMMP14";
    break;
  default:
    molecule = "proCI";
    break;
  }

  // Copy data to result array
  for (int i = 0; i < GRID_SIZE; i++) {
    for (int j = 0; j < GRID_SIZE; j++) {
      result[i * GRID_SIZE + j] = grid[i][j].ecm[molecule];
    }
  }

  return result;
}

// Function for getting feedback data
EMSCRIPTEN_KEEPALIVE
double *getFeedbackData(int molecule_index) {
  double *result = (double *)malloc(GRID_SIZE * GRID_SIZE * sizeof(double));

  // Map molecule index to string key
  std::string molecule;
  switch (molecule_index) {
  case 0:
    molecule = "TGFBfb";
    break;
  case 1:
    molecule = "AngIIfb";
    break;
  case 2:
    molecule = "IL6fb";
    break;
  case 3:
    molecule = "ET1fb";
    break;
  case 4:
    molecule = "tensionfb";
    break;
  default:
    molecule = "TGFBfb";
    break;
  }

  // Copy data to result array
  for (int i = 0; i < GRID_SIZE; i++) {
    for (int j = 0; j < GRID_SIZE; j++) {
      result[i * GRID_SIZE + j] = grid[i][j].feedback[molecule];
    }
  }

  return result;
}

// Function to free allocated memory
EMSCRIPTEN_KEEPALIVE
void freeData(double *ptr) { free(ptr); }

// Function to read a specific cell value from a data array
EMSCRIPTEN_KEEPALIVE
double readDataValue(double *data, int i, int j) {
  return data[i * GRID_SIZE + j];
}

// Set input concentration for a specific molecule in all cells
EMSCRIPTEN_KEEPALIVE
void setInputConcentration(int molecule_index, double value) {
  // Map molecule index to string key
  std::string molecule;
  switch (molecule_index) {
  case 0:
    molecule = "AngIIin";
    break;
  case 1:
    molecule = "TGFBin";
    break;
  case 2:
    molecule = "tensionin";
    break;
  case 3:
    molecule = "IL6in";
    break;
  case 4:
    molecule = "IL1in";
    break;
  case 5:
    molecule = "TNFain";
    break;
  case 6:
    molecule = "NEin";
    break;
  case 7:
    molecule = "PDGFin";
    break;
  case 8:
    molecule = "ET1in";
    break;
  case 9:
    molecule = "NPin";
    break;
  case 10:
    molecule = "E2in";
    break;
  default:
    molecule = "TGFBin";
    break;
  }

  for (auto &row : grid) {
    for (auto &cell : row) {
      cell.icm[molecule] = value;
    }
  }
}

// NEW FUNCTION: Set input concentration for a specific cell
EMSCRIPTEN_KEEPALIVE
void setCellInputConcentration(int molecule_index, int row, int col, double value) {
  // Boundary check
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;
  
  // Map molecule index to string key
  std::string molecule;
  switch (molecule_index) {
  case 0:
    molecule = "AngIIin";
    break;
  case 1:
    molecule = "TGFBin";
    break;
  case 2:
    molecule = "tensionin";
    break;
  case 3:
    molecule = "IL6in";
    break;
  case 4:
    molecule = "IL1in";
    break;
  case 5:
    molecule = "TNFain";
    break;
  case 6:
    molecule = "NEin";
    break;
  case 7:
    molecule = "PDGFin";
    break;
  case 8:
    molecule = "ET1in";
    break;
  case 9:
    molecule = "NPin";
    break;
  case 10:
    molecule = "E2in";
    break;
  default:
    molecule = "TGFBin";
    break;
  }

  // Set the override value for this specific cell
  grid[row][col].input_overrides[molecule] = std::max(0.0, std::min(1.0, value));
  grid[row][col].has_input_override = true;
  
  // Also update the regular icm value for immediate effect
  grid[row][col].icm[molecule] = std::max(0.0, std::min(1.0, value));
}

// NEW FUNCTION: Clear input overrides for a specific cell
EMSCRIPTEN_KEEPALIVE
void clearCellInputOverrides(int row, int col) {
  // Boundary check
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;
  
  grid[row][col].input_overrides.clear();
  grid[row][col].has_input_override = false;
  
  // Reset all input molecules to 0 for this cell
  grid[row][col].icm["AngIIin"] = 0;
  grid[row][col].icm["TGFBin"] = 0;
  grid[row][col].icm["tensionin"] = 0;
  grid[row][col].icm["IL6in"] = 0;
  grid[row][col].icm["IL1in"] = 0;
  grid[row][col].icm["TNFain"] = 0;
  grid[row][col].icm["NEin"] = 0;
  grid[row][col].icm["PDGFin"] = 0;
  grid[row][col].icm["ET1in"] = 0;
  grid[row][col].icm["NPin"] = 0;
  grid[row][col].icm["E2in"] = 0;
}

// NEW FUNCTION: Clear all input overrides from all cells
EMSCRIPTEN_KEEPALIVE
void clearAllInputOverrides() {
  for (auto &row : grid) {
    for (auto &cell : row) {
      cell.input_overrides.clear();
      cell.has_input_override = false;
      
      // Reset all input molecules to 0
      cell.icm["AngIIin"] = 0;
      cell.icm["TGFBin"] = 0;
      cell.icm["tensionin"] = 0;
      cell.icm["IL6in"] = 0;
      cell.icm["IL1in"] = 0;
      cell.icm["TNFain"] = 0;
      cell.icm["NEin"] = 0;
      cell.icm["PDGFin"] = 0;
      cell.icm["ET1in"] = 0;
      cell.icm["NPin"] = 0;
      cell.icm["E2in"] = 0;
    }
  }
}

// Set all input concentrations at once
EMSCRIPTEN_KEEPALIVE
void setAllInputs(double angii, double tgfb, double tension, double il6,
                  double il1, double tnfa, double ne, double pdgf, double et1,
                  double np, double e2) {
  for (auto &row : grid) {
    for (auto &cell : row) {
      cell.icm["AngIIin"] = angii;
      cell.icm["TGFBin"] = tgfb;
      cell.icm["tensionin"] = tension;
      cell.icm["IL6in"] = il6;
      cell.icm["IL1in"] = il1;
      cell.icm["TNFain"] = tnfa;
      cell.icm["NEin"] = ne;
      cell.icm["PDGFin"] = pdgf;
      cell.icm["ET1in"] = et1;
      cell.icm["NPin"] = np;
      cell.icm["E2in"] = e2;
    }
  }
}

// Set time step for simulation
EMSCRIPTEN_KEEPALIVE
void setTimeStep(double dt) { rates.time_step = dt; }

// Set rate constant values
EMSCRIPTEN_KEEPALIVE
void setRateConstants(double k_in, double k_fb, double k_deg, double k_recep,
                      double k_inhib, double k_act, double k_prod,
                      double k_diff) {
  rates.k_input = k_in;
  rates.k_feedback = k_fb;
  rates.k_degradation = k_deg;
  rates.k_receptor = k_recep;
  rates.k_inhibition = k_inhib;
  rates.k_activation = k_act;
  rates.k_production = k_prod;
  rates.k_diffusion = k_diff;
}

// Get ODE system status
EMSCRIPTEN_KEEPALIVE
double *getODEParameters() {
  double *params = (double *)malloc(8 * sizeof(double));
  params[0] = rates.k_input;
  params[1] = rates.k_feedback;
  params[2] = rates.k_degradation;
  params[3] = rates.k_receptor;
  params[4] = rates.k_inhibition;
  params[5] = rates.k_activation;
  params[6] = rates.k_production;
  params[7] = rates.k_diffusion;
  return params;
}

// Function to set concentration for a specific cell and molecule
EMSCRIPTEN_KEEPALIVE
void setCellConcentration(int isFeedback, int moleculeIndex, int row, int col, double value) {
    // Boundary check
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;
    
    if (isFeedback) {
        // For feedback molecules
        std::string molecule;
        switch (moleculeIndex) {
            case 0: molecule = "TGFBfb"; break;
            case 1: molecule = "AngIIfb"; break;
            case 2: molecule = "IL6fb"; break;
            case 3: molecule = "ET1fb"; break;
            case 4: molecule = "tensionfb"; break;
            default: molecule = "TGFBfb"; break;
        }
        // Set the value, clamped between 0 and 1
        grid[row][col].feedback[molecule] = std::max(0.0, std::min(1.0, value));
    } else {
        // For ECM molecules
        std::string molecule;
        switch (moleculeIndex) {
            case 0: molecule = "proCI"; break;
            case 1: molecule = "proCIII"; break;
            case 2: molecule = "fibronectin"; break;
            case 3: molecule = "periostin"; break;
            case 4: molecule = "TNC"; break;
            case 5: molecule = "PAI1"; break;
            case 6: molecule = "CTGF"; break;
            case 7: molecule = "EDAFN"; break;
            case 8: molecule = "TIMP1"; break;
            case 9: molecule = "TIMP2"; break;
            case 10: molecule = "proMMP1"; break;
            case 11: molecule = "proMMP2"; break;
            case 12: molecule = "proMMP3"; break;
            case 13: molecule = "proMMP8"; break;
            case 14: molecule = "proMMP9"; break;
            case 15: molecule = "proMMP12"; break;
            case 16: molecule = "proMMP14"; break;
            default: molecule = "proCI"; break;
        }
        // Set the value, clamped between 0 and 1
        grid[row][col].ecm[molecule] = std::max(0.0, std::min(1.0, value));
    }
}

} // extern "C"