"""Camel-case contract for the React demo integration surface (`demo-v1`)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas import APIModel


class DemoWorkspaceRef(APIModel):
    id: str
    ref: str
    name: str


class DemoCustomerResponse(APIModel):
    id: str
    name: str
    company: str
    email: str
    phone: str
    location: str
    segment: str
    since: datetime | None
    status: str
    owner: str
    sourceIds: list[str]
    synthetic: bool


class DemoSourceResponse(APIModel):
    id: str
    name: str
    kind: str
    provider: str
    status: str
    lastSync: datetime | None
    health: int
    note: str
    documentCount: int


class DemoFieldResponse(APIModel):
    field: str
    category: str
    confidence: float | None
    note: str | None = None


class DemoSchemaFieldResponse(APIModel):
    field: str
    type: str
    example: str
    classification: str


class DemoDocumentResponse(APIModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    kind: str
    sourceId: str
    customerId: str | None
    customerIds: list[str]
    subjectCount: int
    sizeKb: float
    modifiedAt: datetime | None
    createdAt: datetime | None
    importState: str
    sensitivity: str
    reviewStatus: str
    confidence: float | None
    tags: list[str]
    snippet: str
    fields: list[DemoFieldResponse]
    schema_fields: list[DemoSchemaFieldResponse] = Field(alias="schema")
    missing: list[str]
    collection: str | None = None
    preview: dict[str, Any]


class DemoPolicyResponse(APIModel):
    id: str
    policyName: str
    area: str
    outcome: str
    subject: str
    customerId: str | None
    documentId: str | None
    decidedAt: datetime | None
    explanation: str
    evidence: list[str]


class DemoPolicyRule(APIModel):
    key: str
    value: str


class DemoActivePolicyResponse(APIModel):
    id: str
    name: str
    version: int
    status: str
    rules: list[DemoPolicyRule]


class DemoCampaignResponse(APIModel):
    id: str
    name: str
    channel: str
    scheduledFor: datetime | None
    status: str
    message: str


class DemoCampaignRecipientResponse(APIModel):
    id: str
    campaignId: str
    customerId: str | None
    email: str
    decision: str
    reason: str
    status: str


class DemoSourceProgressResponse(APIModel):
    sourceId: str
    status: str
    detail: str | None = None


class DemoArtifactRefResponse(APIModel):
    id: str
    kind: str
    status: str
    downloadUrl: str | None = None


class DemoRightsRequestResponse(APIModel):
    id: str
    reference: str
    customerId: str
    type: str
    receivedAt: datetime | None
    dueAt: datetime | None
    status: str
    sourceProgress: list[DemoSourceProgressResponse]
    notes: str
    artifact: DemoArtifactRefResponse | None = None


class DemoHoldResponse(APIModel):
    id: str
    subjectRef: str | None
    sourceId: str | None
    recordRefId: str | None
    reasonCode: str
    status: str
    expiresAt: datetime | None
    createdAt: datetime | None
    reviewNote: str | None = None


class DemoTimelineEntry(APIModel):
    at: datetime | None
    label: str
    tone: str


class DemoJobResponse(APIModel):
    id: str
    name: str
    kind: str
    status: str
    progress: int
    startedAt: datetime | None
    finishedAt: datetime | None
    attempts: int
    maxAttempts: int
    failureSummary: str | None = None
    timeline: list[DemoTimelineEntry]


class DemoAuditEventResponse(APIModel):
    id: str
    at: datetime | None
    actor: str
    action: str
    target: str
    category: str
    severity: str
    hash: str
    prevHash: str


class DemoCheckpointResponse(APIModel):
    id: str
    at: datetime | None
    eventsCovered: int
    hash: str
    status: str


class DemoIncidentResponse(APIModel):
    id: str
    status: str
    firstFailureSequence: int
    reasonCode: str
    reasonMessage: str
    detectedAt: datetime | None
    linkedBreachIncidentId: str | None = None


class DemoIntegrityResponse(APIModel):
    status: str
    evidenceState: str
    trustedThroughSequence: int | None
    failureSequence: int | None
    reasonCode: str | None
    failures: list[dict[str, Any]]
    gateState: str
    incidentId: str | None
    checkpointStatus: str | None
    verifiedAt: datetime | None
    disclaimer: str
    incidents: list[DemoIncidentResponse]
    breachCounts: dict[str, int]


class DemoBreachResponse(APIModel):
    id: str
    incidentRef: str
    title: str
    description: str
    origin: str
    severity: str
    status: str
    scopeStatus: str
    detectedAt: datetime | None
    assessmentDueAt: datetime | None
    timerState: str
    notifiable: bool | None
    assessmentTimeliness: str | None
    affectedSubjects: int
    affectedSources: int
    notificationStatus: str
    linkedIntegrityIncidentId: str | None = None


class DemoFlagsResponse(APIModel):
    failureInjectionEnabled: bool
    resetAvailable: bool
    syntheticContactsAvailable: bool
    userSubjectRef: str | None


class DemoSnapshotResponse(APIModel):
    schemaVersion: str
    workspace: DemoWorkspaceRef
    generatedAt: datetime | None
    notice: str
    contactMode: str
    customers: list[DemoCustomerResponse]
    sources: list[DemoSourceResponse]
    documents: list[DemoDocumentResponse]
    policies: list[DemoPolicyResponse]
    activePolicy: DemoActivePolicyResponse | None
    campaigns: list[DemoCampaignResponse]
    campaignRecipients: list[DemoCampaignRecipientResponse]
    rightsRequests: list[DemoRightsRequestResponse]
    rightsHolds: list[DemoHoldResponse]
    jobs: list[DemoJobResponse]
    auditEvents: list[DemoAuditEventResponse]
    checkpoints: list[DemoCheckpointResponse]
    integrity: DemoIntegrityResponse
    breaches: list[DemoBreachResponse]
    demo: DemoFlagsResponse


class DemoEvaluateRequest(BaseModel):
    subjectRef: str = Field(min_length=1, max_length=80)
    purpose: str = Field(min_length=1, max_length=80)
    channel: str = Field(min_length=1, max_length=48)
    recordRefId: str | None = Field(default=None, max_length=36)


class DemoCampaignCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    purpose: str = Field(default="marketing", max_length=80)
    channel: str = Field(default="whatsapp", max_length=48)
    templateId: str = Field(default="course-update-v1", max_length=100)
    importId: str | None = None
    recordIds: list[str] | None = None
    subjectRef: str | None = None


class DemoCorrectionRequest(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    requestedValue: str = Field(min_length=1, max_length=500)
    reason: str | None = Field(default=None, max_length=500)


class DemoRightsCreateRequest(BaseModel):
    subjectRef: str = Field(min_length=1, max_length=80)
    requestType: str = Field(min_length=1, max_length=24)
    requesterReference: str | None = Field(default=None, max_length=160)
    correction: DemoCorrectionRequest | None = None


class DemoHoldCreateRequest(BaseModel):
    subjectRef: str | None = None
    sourceId: str | None = None
    recordRefId: str | None = None
    reasonCode: str = Field(default="LEGAL_OBLIGATION", max_length=80)
    reviewNote: str | None = Field(default=None, max_length=320)
    expiresAt: datetime | None = None


class DemoHoldReleaseRequest(BaseModel):
    note: str | None = Field(default=None, max_length=320)


class DemoIncidentResolveRequest(BaseModel):
    decision: str = Field(min_length=1, max_length=32)
    note: str = Field(min_length=8, max_length=500)


class DemoCheckpointRequest(BaseModel):
    note: str | None = Field(default=None, max_length=320)


class DemoBreachCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3, max_length=4000)
    severity: str = Field(default="MEDIUM", max_length=16)
    subjectRefs: list[str] = Field(default_factory=list, max_length=500)
    sourceIds: list[str] = Field(default_factory=list, max_length=100)
    detectedAt: datetime | None = None
    containmentSummary: str | None = Field(default=None, max_length=2000)


class DemoBreachAssessmentRequest(BaseModel):
    notifiable: bool
    reasonCode: str = Field(min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=500)


class DemoBreachCloseRequest(BaseModel):
    note: str = Field(min_length=8, max_length=500)


class DemoFailureRequest(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    targetId: str | None = Field(default=None, max_length=120)


class DemoConsentRequest(BaseModel):
    granted: bool


class DemoUserRequestCreate(BaseModel):
    type: str = Field(min_length=1, max_length=24)
    correction: DemoCorrectionRequest | None = None


class DemoUserProfile(APIModel):
    id: str
    name: str
    email: str
    phone: str
    location: str
    memberSince: datetime | None
    synthetic: bool


class DemoUserSource(APIModel):
    id: str
    name: str
    provider: str
    category: str
    status: str
    lastSync: datetime | None
    recordCount: int
    purpose: str


class DemoUserConsent(APIModel):
    id: str
    purpose: str
    description: str
    granted: bool
    required: bool
    updatedAt: datetime | None
    channel: str
    expiresAt: datetime | None


class DemoUserDocument(APIModel):
    id: str
    name: str
    kind: str
    sourceId: str
    updatedAt: datetime | None
    sizeKb: float
    sensitivity: str
    summary: str
    heldSince: datetime | None
    retention: str
    fields: list[DemoFieldResponse]


class DemoUserStep(APIModel):
    id: str
    label: str
    status: str
    detail: str | None = None


class DemoUserRequest(APIModel):
    id: str
    reference: str
    type: str
    submittedAt: datetime | None
    dueAt: datetime | None
    status: str
    steps: list[DemoUserStep]
    resolution: str | None = None


class DemoUserActivity(APIModel):
    id: str
    at: datetime | None
    action: str
    actor: str
    category: str
    severity: str


class DemoUserWorkspaceResponse(APIModel):
    generatedAt: datetime | None
    notice: str
    contactMode: str
    demoSubjectRef: str | None
    profile: DemoUserProfile | None
    sources: list[DemoUserSource]
    consents: list[DemoUserConsent]
    documents: list[DemoUserDocument]
    requests: list[DemoUserRequest]
    activity: list[DemoUserActivity]


class DemoImportResponse(DemoSnapshotResponse):
    importedDocumentId: str | None = None
