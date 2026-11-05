"""Data models for contract analysis results."""

from __future__ import annotations

import json
from enum import Enum

from pydantic import BaseModel, Field


class Severity(str, Enum):
    """Severity level of an identified issue."""

    RED = "red"
    YELLOW = "yellow"
    GREEN = "green"


class ContractType(str, Enum):
    """Supported contract types."""

    RENTAL = "rental"
    INTERNSHIP = "internship"
    EMPLOYMENT = "employment"
    NDA = "nda"
    UNKNOWN = "unknown"


class StatuteStatus(str, Enum):
    """Outcome of one deterministic statute check."""

    VIOLATION = "violation"
    OK = "ok"
    UNKNOWN = "unknown"


class StatuteCheck(BaseModel):
    """One deterministic statute-rule evaluation."""

    rule_id: str = Field(description="Stable rule identifier")
    title: str = Field(description="Short rule name")
    basis: str = Field(description="Legal basis for the rule")
    status: StatuteStatus = Field(description="violation / ok / unknown")
    detail: str = Field(description="What was found, or why it cannot be judged")
    quote: str = Field(default="", description="Clause excerpt the verdict rests on")


class Issue(BaseModel):
    """A single identified issue in the contract."""

    title: str = Field(description="Short title of the issue")
    severity: Severity = Field(description="Severity: red (danger), yellow (warning), green (ok)")
    clause: str = Field(description="The relevant clause or section reference")
    quote: str = Field(description="Direct quote from the contract")
    explanation: str = Field(description="Plain-language explanation of the issue")
    suggestion: str = Field(description="Suggested modification or action")
    redline: str = Field(
        default="",
        description="Replacement clause wording, ready to paste into a negotiation email",
    )


class Protection(BaseModel):
    """A positive protection found in the contract."""

    title: str = Field(description="What is protected")
    clause: str = Field(description="The relevant clause or section")
    explanation: str = Field(description="Why this protection matters")


class AnalysisResult(BaseModel):
    """Complete analysis result for a contract."""

    contract_type: ContractType = Field(description="Detected type of contract")
    summary: str = Field(description="2-3 sentence plain-language summary of the contract")
    parties: list[str] = Field(default_factory=list, description="Parties involved")
    key_terms: list[str] = Field(
        default_factory=list, description="Key terms (duration, payment, etc.)"
    )
    red_flags: list[Issue] = Field(default_factory=list, description="Serious issues found")
    warnings: list[Issue] = Field(default_factory=list, description="Moderate concerns")
    good_clauses: list[Protection] = Field(
        default_factory=list, description="Positive protections found"
    )
    missing_protections: list[str] = Field(
        default_factory=list, description="Important protections not found in the contract"
    )
    statute_checks: list[StatuteCheck] = Field(
        default_factory=list, description="Deterministic statute-rule verdicts"
    )
    fairness_score: int = Field(
        ge=0, le=100, description="Overall fairness score from 0 (terrible) to 100 (excellent)"
    )
    fairness_grade: str = Field(description="Letter grade: A+, A, B+, B, C+, C, D, F")

    def to_json(self, *, indent: int | None = 2) -> str:
        """JSON for the --json CLI output; empty per-issue redlines are omitted."""
        data = self.model_dump(mode="json")
        for issues in (data["red_flags"], data["warnings"]):
            for issue in issues:
                if not issue["redline"]:
                    del issue["redline"]
        return json.dumps(data, indent=indent, ensure_ascii=False)
