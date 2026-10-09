export interface planstep{
    id:string;
    title:string;
    description:string;
    hints?:string;
    complexity?: 'low'|'medium'|'high';
}


export interface plan{
   goal:string;
   researchSummary?:string;
   steps:planstep[];
}


