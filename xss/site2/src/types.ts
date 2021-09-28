export interface Site {
    type: string;
    created: Date;
    id: string;
    hash: string;
    content: string;
}

export interface User {
    sites: Record<string, Site>;
    created: Date;
    id: string;
}
