import React from "react";
import { useParams } from "wouter";
import ConsultationFormFields from "./ConsultationFormFields";

export default function EditConsultation() {
  const { id } = useParams<{ id: string }>();
  return <ConsultationFormFields consultationId={id} />;
}
