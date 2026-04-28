export type ExternalSourceSeed = {
  companyKey: string;
  companyName: string;
  careersUrl: string;
  phase: 1 | 2;
};

// Phase 1 list includes requested Bangladesh software companies.
export const EXTERNAL_SOURCE_SEEDS: ExternalSourceSeed[] = [
  {
    companyKey: "grameenphone",
    companyName: "Grameenphone",
    careersUrl: "https://www.grameenphone.com/about/career",
    phase: 1,
  },
  {
    companyKey: "robi",
    companyName: "Robi Axiata",
    careersUrl: "https://www.robi.com.bd/en/career",
    phase: 1,
  },
  {
    companyKey: "bkash",
    companyName: "bKash",
    careersUrl: "https://www.bkash.com/career",
    phase: 1,
  },
  {
    companyKey: "pathao",
    companyName: "Pathao",
    careersUrl: "https://pathao.com/career/",
    phase: 1,
  },
  {
    companyKey: "vivasoft",
    companyName: "Vivasoft",
    careersUrl: "https://vivasoftltd.com/career",
    phase: 1,
  },
  {
    companyKey: "cefalo",
    companyName: "Cefalo",
    careersUrl: "https://cefalo.com/en/jobs/",
    phase: 1,
  },
  {
    companyKey: "enosis",
    companyName: "Enosis Solutions",
    careersUrl: "https://www.enosisbd.com/career",
    phase: 1,
  },
  {
    companyKey: "dsi",
    companyName: "Dynamic Solution Innovators (DSI)",
    careersUrl: "https://www.dsinnovators.com/career",
    phase: 1,
  },
  {
    companyKey: "trekarsh",
    companyName: "Trekarsh",
    careersUrl: "https://trekarsh.com/career",
    phase: 1,
  },
  {
    companyKey: "daraz-bd",
    companyName: "Daraz Bangladesh",
    careersUrl: "https://www.daraz.com.bd/careers/",
    phase: 1,
  },
];

