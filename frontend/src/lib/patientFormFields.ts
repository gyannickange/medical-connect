export type PatientFieldType = "text" | "textarea" | "date" | "email" | "select" | "checkbox";

export interface PatientFieldConfig {
  name: string;
  labelKey: string;
  type: PatientFieldType;
  required?: boolean;
  options?: { value: string; labelKey: string }[];
}

export interface PatientFormSection {
  key: string;
  titleKey: string;
  fields: PatientFieldConfig[];
}

export const patientFormSections: PatientFormSection[] = [
  {
    key: "identification",
    titleKey: "sectionIdentification",
    fields: [
      { name: "lastName", labelKey: "lastName", type: "text", required: true },
      { name: "firstName", labelKey: "firstName", type: "text", required: true },
      { name: "dateOfBirth", labelKey: "dateOfBirth", type: "date", required: true },
      {
        name: "sex",
        labelKey: "sex",
        type: "select",
        required: true,
        options: [
          { value: "M", labelKey: "sexMale" },
          { value: "F", labelKey: "sexFemale" },
        ],
      },
      { name: "primaryPhone", labelKey: "primaryPhone", type: "text", required: true },
      { name: "residenceAddress", labelKey: "residenceAddress", type: "text", required: true },
      { name: "usualName", labelKey: "usualName", type: "text" },
      { name: "birthPlace", labelKey: "birthPlace", type: "text" },
      { name: "nationality", labelKey: "nationality", type: "text" },
      { name: "profession", labelKey: "profession", type: "text" },
      { name: "maritalStatus", labelKey: "maritalStatus", type: "text" },
      {
        name: "idDocumentType",
        labelKey: "idDocumentType",
        type: "select",
        options: [
          { value: "cni", labelKey: "idDocumentTypeCni" },
          { value: "passeport", labelKey: "idDocumentTypePasseport" },
          { value: "permis", labelKey: "idDocumentTypePermis" },
          { value: "autre", labelKey: "idDocumentTypeAutre" },
        ],
      },
      { name: "idDocumentNumber", labelKey: "idDocumentNumber", type: "text" },
      { name: "idDocumentExpiry", labelKey: "idDocumentExpiry", type: "date" },
      { name: "email", labelKey: "email", type: "email" },
    ],
  },
  {
    key: "contact",
    titleKey: "sectionContact",
    fields: [
      { name: "secondaryPhone", labelKey: "secondaryPhone", type: "text" },
      { name: "residenceZone", labelKey: "residenceZone", type: "text" },
      { name: "fullAddress", labelKey: "fullAddress", type: "textarea" },
    ],
  },
  {
    key: "emergencyContact",
    titleKey: "sectionEmergencyContact",
    fields: [
      { name: "emergencyContact.name", labelKey: "emergencyContactName", type: "text", required: true },
      { name: "emergencyContact.relation", labelKey: "emergencyContactRelation", type: "text", required: true },
      { name: "emergencyContact.phone", labelKey: "emergencyContactPhone", type: "text", required: true },
      { name: "emergencyContact.address", labelKey: "emergencyContactAddress", type: "text" },
      { name: "emergencyContact.isPriority", labelKey: "emergencyContactIsPriority", type: "checkbox", required: true },
    ],
  },
  {
    key: "medical",
    titleKey: "sectionMedical",
    fields: [
      { name: "bloodGroup", labelKey: "bloodGroup", type: "text" },
      {
        name: "allergyKnowledge",
        labelKey: "allergyKnowledge",
        type: "select",
        options: [
          { value: "aucune_connue", labelKey: "allergyKnowledgeAucuneConnue" },
          { value: "allergies_connues", labelKey: "allergyKnowledgeAllergiesConnues" },
          { value: "non_renseigne", labelKey: "allergyKnowledgeNonRenseigne" },
        ],
      },
      { name: "allergyDetails", labelKey: "allergyDetails", type: "textarea" },
      { name: "medicalHistory", labelKey: "medicalHistory", type: "textarea" },
      { name: "surgicalHistory", labelKey: "surgicalHistory", type: "textarea" },
      { name: "chronicDiseases", labelKey: "chronicDiseases", type: "textarea" },
      { name: "currentTreatments", labelKey: "currentTreatments", type: "textarea" },
      { name: "disabilities", labelKey: "disabilities", type: "textarea" },
    ],
  },
  {
    key: "administrative",
    titleKey: "sectionAdministrative",
    fields: [
      { name: "facilityService", labelKey: "facilityService", type: "text" },
      {
        name: "patientType",
        labelKey: "patientType",
        type: "select",
        options: [
          { value: "externe", labelKey: "patientTypeExterne" },
          { value: "hospitalise", labelKey: "patientTypeHospitalise" },
          { value: "urgence", labelKey: "patientTypeUrgence" },
        ],
      },
      {
        name: "paymentMode",
        labelKey: "paymentMode",
        type: "select",
        options: [
          { value: "assurance", labelKey: "paymentModeAssurance" },
          { value: "mutuelle", labelKey: "paymentModeMutuelle" },
          { value: "tiers_payant", labelKey: "paymentModeTiersPayant" },
          { value: "comptant", labelKey: "paymentModeComptant" },
        ],
      },
      { name: "insuranceName", labelKey: "insuranceName", type: "text" },
      { name: "insuranceNumber", labelKey: "insuranceNumber", type: "text" },
      { name: "financiallyResponsible", labelKey: "financiallyResponsible", type: "text" },
    ],
  },
  {
    key: "pediatric",
    titleKey: "sectionPediatric",
    fields: [
      { name: "pediatricInfo.fatherName", labelKey: "pediatricFatherName", type: "text" },
      { name: "pediatricInfo.motherName", labelKey: "pediatricMotherName", type: "text" },
      { name: "pediatricInfo.legalGuardian", labelKey: "pediatricLegalGuardian", type: "text" },
      { name: "pediatricInfo.guardianPhone", labelKey: "pediatricGuardianPhone", type: "text" },
      { name: "pediatricInfo.weightKg", labelKey: "pediatricWeightKg", type: "text" },
      { name: "pediatricInfo.heightCm", labelKey: "pediatricHeightCm", type: "text" },
      { name: "pediatricInfo.birthInfo", labelKey: "pediatricBirthInfo", type: "textarea" },
      { name: "pediatricInfo.vaccinations", labelKey: "pediatricVaccinations", type: "textarea" },
    ],
  },
];
