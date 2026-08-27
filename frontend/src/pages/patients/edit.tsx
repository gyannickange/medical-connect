import React from "react";
import { useParams } from "wouter";
import PatientFormFields from "./PatientFormFields";

export default function EditPatient() {
  const { id } = useParams<{ id: string }>();
  return <PatientFormFields patientId={id} />;
}
