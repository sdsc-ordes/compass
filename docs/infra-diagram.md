# Infrastructure Diagram

## Ocean Care

Questions:

- do we need a graph database? or can we store the RDF as JSON or other format in a DB.
- should database be postgres or RustFS (bucket storage) ? --> Depends on what we need to store.
- do we store tables and RDF or just RDF ?
- convert script: what language?

Flows:

- what is the schedule for data updates? once per month or more often? 

```mermaid
flowchart TD
    subgraph server
    wdb([SQL Database for Wordpress])
    w([Wordpress CDM])
    r([React map plugin])
    gdb([Graph database])
    db([Database])
    wdb -. storage for .-> w
    db -- feeds --> r
    gdb -- feeds --> r
    r -- featured in --> w
    end 
    subgraph data 
    p([Ocean Care Personel])
    rdf([RDF Data])
    t([raw tables])
    p -- updates with new data (?) --> t
    t -- converted by convert script (?) --> rdf
    rdf -. stored in (?) .-> gdb
    t -. stored in (?) .-> db
    end
```