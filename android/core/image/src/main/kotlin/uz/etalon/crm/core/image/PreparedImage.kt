package uz.etalon.crm.core.image

import java.io.File

/** A photo that is ready to upload: JPEG, orientation applied, inside the size cap. */
data class PreparedImage(val file: File, val width: Int, val height: Int, val bytes: Long)
