# Mermaid Syntax Quick Reference

## Flowchart

```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
```

Directions: `TD` (top-down), `LR` (left-right), `BT`, `RL`

Node shapes:

- `A[text]` - rectangle
- `A(text)` - rounded
- `A{text}` - diamond
- `A([text])` - stadium
- `A[[text]]` - subroutine
- `A[(text)]` - cylinder
- `A((text))` - circle

## Sequence Diagram

```mermaid
sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello
    B-->>A: Hi
    A->>+B: Request
    B->>-A: Response
    Note over A,B: Shared note
```

Arrows: `->>` solid, `-->>` dashed, `-x` cross, `-)` open

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Running: start
    Running --> Idle: stop
    Running --> [*]: terminate
```

## Class Diagram

```mermaid
classDiagram
    class Animal {
        +String name
        +eat()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog
```

Relations: `<|--` inheritance, `*--` composition, `o--` aggregation, `-->` association

## ER Diagram

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    PRODUCT ||--o{ LINE-ITEM : includes
```

Cardinality: `||` one, `o|` zero or one, `}|` one or more, `}o` zero or more
