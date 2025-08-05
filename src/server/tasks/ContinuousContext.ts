
const projectContextTemplate = `
# Collective Project Context

This context represents the collective "brain state" of you and all other agents working on this project / task. This context provides a "hive-mind-like" awareness while enabling you to still act independently.
The Project Context section represents the collective knowledge of every agent that has worked on this project and provides a "brain state" that should provide you with context on the project as a whole and how it works.
The Task Context section represents the collective knowledge of the current OrgChart working on the task provided by the user

INSTRUCTIONS: Provide context based on every file present in the project that is not in the .gitignore. Some sections you might consider adding are:
 * "Structure": the file and folder scheme for the project, where tests go, etc.
 * "Configuration": which config files exist and what they do, useful CLI commands, the different technologies and dependencies used, any scripts that already exist, etc.
 * "Style": a brief guide on how to imitate the current style of the project, things like class naming, variable naming, test naming, whether it's functional, stream-based, object oriented, uses callbacks, etc.
 * "Logical Flow": the key section where you describe how the system works:
    * Refer to things using the item name and the file name like '\`getSnailVelocity()\` [BugMeasurements.py]' or '\`## Lost and Found\` [SCHOOL.md]'
    * Describe how every thing/concept/input/output/background process/network call/etc interacts
    * Provide a logical hierarchy of components. You should provide this as a directed graph where the highest-order components are at the top
    * Take creative freedom and eagerness to include anything else that you believe is relevant to understanding the project as this should be a complete mental map of the project
`

/**
 * Retrieve the current context, this will block if there are updates being made
 */
const getContextSnapshot = async (): string => {

}

const updateContext: string = () => {

}