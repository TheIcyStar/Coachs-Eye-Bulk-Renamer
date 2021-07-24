//Requires
const sqlite3 = require("sqlite3")
const sqlite = require("sqlite")
const fs = require("fs")
const path = require("path")

//Stat trackers
let filesChanged = 0
let DBEntriesProcessed = 0


//Sanity checks for arguments
async function checkArguments(){
    //check correct amount
    if(process.argv.length < 4){
        throw new Error("Missing arguments!\n <sqLite database path> <Media folder>")
    }
    
    //sqLite file read test
    await fs.promises.access(process.argv[2],fs.constants.R_OK).catch((err) => {
        console.log("Could not access sqLite file: "+process.argv[2])
        throw err
    })

    await fs.promises.access(process.argv[3],fs.constants.W_OK).catch((err) => {
        console.log("Could not access media folder: "+process.argv[3])
        throw err
    })
}



(async () => {
    try{
        await checkArguments()
    } catch (err) {
        throw err
    }

    //open DB
    let db
    try{
        db = await sqlite.open({
        filename: process.argv[2],
        driver: sqlite3.Database
        })
    } catch (err) {
        console.log("SQLite could not open the database file: "+process.argv[2])
        throw err
    }

    //get tags
    const videoPaths = await db.all('SELECT Z_PK, ZTITLE, ZVIDEOPATHFORVIEWING FROM ZFOOTAGE')

    //rename videos
    for(let entryIndex = 0; entryIndex < videoPaths.length; entryIndex++){
        let video = videoPaths[entryIndex]

        //ZVIDEOPATHFORVIEWING null check
        if(!video.ZVIDEOPATHFORVIEWING) continue

        let videoFileName = video.ZVIDEOPATHFORVIEWING.split("/").pop()
        let videoPath = path.join(process.argv[3], videoFileName)

        //Video exists check
        try {
            await fs.promises.access(videoPath, fs.constants.W_OK)
        } catch (err) {
            console.log("["+(entryIndex+1)+"/"+videoPaths.length+"] Could not find video "+videoFileName+" in media folder, skipping")
            continue
        }



        //Start building new filename - Format: 'Z_PK-Title-_Tag(s)-Timestamp.extention' (Z_PK being the ID of the video)
        let newFileName = ""

        //Add Video ID (Z_PK)
        newFileName += video.Z_PK
        
        //add Title
        if(video.ZTITLE){
            newFileName += video.ZTITLE+"-"
        }

        //add tags
        const videoTags = await db.all('SELECT Z_2TAGS FROM Z_2FOOTAGECOLLECTION WHERE Z_8FOOTAGECOLLECTION = '+video.Z_PK) //get all of the tags that the video has
        let tagsString = ""
        for (const tag of videoTags) {
            const tagInfo = await db.get('SELECT ZISREADONLY, ZNAME FROM ZCETAG WHERE Z_PK = '+tag.Z_2TAGS) //get name & isReadOnly of tag
            if(tagInfo.ZISREADONLY === 0){
                tagsString += "_"+tagInfo.ZNAME
            }
        }
        newFileName += tagsString+"-"

        //add timestamp from the video's original name
        newFileName += videoFileName.split("-")[0]+"-"+videoFileName.split("-")[1]+"-"

        //add extention
        newFileName += videoFileName.split(".").pop()


        //Rename video
        try{
            let newPath = path.join(process.argv[3], newFileName)
            fs.promises.rename(videoPath, newPath)
        } catch (err) {
            console.log("Error while renaming video "+videoFileName+" --> "+newFileName)
            console.log(err)
            continue
        }

        filesChanged++
        console.log("["+(entryIndex+1)+"/"+videoPaths.length+"] Renamed video '"+videoFileName+"' to "+newFileName)
    }

    console.log("TASK DONE! Database entries processed: "+videoPaths.length+", Files changed: "+filesChanged+", Entries ignored: "+(DBEntriesProcessed - filesChanged))
})()