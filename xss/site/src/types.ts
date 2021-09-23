export interface Note {
    type: string;
    created: Date;
    id: string;
    hash: string;
    content: string;
}

export interface User {
    notes: Record<string, Note>;
    created: Date;
    id: string;
}
