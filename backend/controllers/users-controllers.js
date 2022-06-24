import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { validationResult } from 'express-validator'
import cloudinary from 'cloudinary'

import HttpError from '../utils/http-error.js'
import User from '../models/user-model.js'
import cookieToken from '../utils/cookieToken.js'

export const getUsers = async (req, res, next) => {
  let users
  try {
    users = await User.find()
  } catch (e) {
    return next(new HttpError('Fetching users failed, try again', 500))
  }
  res.json({
    users: users.map((user) => user.toObject({ getters: true })),
  })
}

export const getUserProfile = async (req, res, next) => {
  const uid = req.params.uid
  let user
  try {
    user = await User.findById(uid)
  } catch (e) {
    return next(new HttpError('Something went wrong, please try again', 500))
  }
  if (!user) {
    return next(new HttpError('No user exists with that ID, try again', 500))
  }
  user.password = undefined
  res.status(200).json({ user })
}

export const signup = async (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return next(
      new HttpError('Invalid inputs passed, please check your data.', 422),
    )
  }
  const { firstname, lastname, email, password } = req.body

  try {
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return next(
        new HttpError('User exists already, please login instead', 422),
      )
    }
  } catch (e) {
    return next(new HttpError('Signing up failed, please try again', 500))
  }

  let file = req.files.avatar
  let avatarUploadResult
  try {
    avatarUploadResult = await cloudinary.v2.uploader.upload(
      file.tempFilePath,
      {
        name: 'avatar',
        folder: process.env.CLOUDINARY_FOLDER + 'avatar',
      },
    )
  } catch (e) {
    return next(new HttpError('Something went wrong, please try again!', 500))
  }

  const newUser = await User.create({
    firstname,
    lastname,
    email,
    password,
    avatar: {
      id: avatarUploadResult.public_id,
      secure_url: avatarUploadResult.secure_url,
    },
  })

  cookieToken(newUser, res)
}

export const login = async (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty())
    return next(
      new HttpError('Invalid inputs passed, please check your data.', 422),
    )

  const { email, password } = req.body
  let user
  try {
    user = await User.findOne({ email: email })
    if (!user)
      return next(
        new HttpError("Email don't exists, please signup instead", 403),
      )
  } catch (e) {
    return next(new HttpError('Logging in failed, Please try again', 500))
  }

  const isPasswordCorrect = await user.isValidatedPassword(password)

  if (!isPasswordCorrect) {
    return next(new HttpError('Wrong password', 400))
  }
  cookieToken(user, res)
}

export const logout = async (req, res, next) => {
  try {
    res.cookie('token', null, { expires: new Date(Date.now()), httpOnly: true })
    res.status(200).json({ success: true, message: 'Logout success' })
  } catch (error) {
    console.log(error)
  }
}

export const updateProfile = async (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return next(
      new HttpError('Invalid inputs passed, please check your data.', 422),
    )
  }

  const uid = req.params.uid
  const { firstname, lastname, email } = req.body

  let user
  try {
    user = await User.findById(uid)
  } catch (e) {
    return next(new HttpError('Something went wrong, please try Again', 500))
  }
  if (!user) {
    return next(new HttpError('No user exits with that id', 403))
  }

  user.firstname = firstname
  user.lastname = lastname
  user.email = email

  try {
    await user.save()
  } catch (e) {
    console.log(e)
    return next(new HttpError('Something went wrong, please try again', 403))
  }

  res.json({ message: 'Updates successfully!' })
}

export const updateProfilePic = async (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty())
    return next(
      new HttpError('Invalid inputs passed, please check your data.', 422),
    )

  const { uid, flag } = req.body
  let user
  try {
    user = await User.findById(uid)
  } catch (e) {
    return next(new HttpError('Something went wrong, please try again', 500))
  }
  if (!user) return next(new HttpError('No user found with that id', 400))

  switch (flag) {
    case 'CHANGE_AVATAR':
      let file = req.files.newAvatar
      let avatarUploadResult
      try {
        if (user.avatar.id !== null)
          await cloudinary.v2.uploader.destroy(user.avatar.id)
        avatarUploadResult = await cloudinary.v2.uploader.upload(
          file.tempFilePath,
          {
            name: 'avatar',
            folder: process.env.CLOUDINARY_FOLDER + 'avatar',
          },
        )
        user.avatar.id = avatarUploadResult.public_id
        user.avatar.secure_url = avatarUploadResult.secure_url
        await user.save()
      } catch (e) {
        return next(
          new HttpError('Something went wrong, please try again', 500),
        )
      }
      res.status(200).json({ success: true, user })
      break
    case 'REMOVE_AVATAR':
      if (user.avatar.id === null)
        return next(new HttpError('Pic is already being removed', 400))
      try {
        await cloudinary.v2.uploader.destroy(user.avatar.id)
        user.avatar.id = null
        user.avatar.secure_url = null
        await user.save()
      } catch (e) {
        return next(
          new HttpError('Something went wrong, please try again', 500),
        )
      }
      res.status(200).json({ success: true, user })
      break
    default:
      return next(new HttpError('Wrong flag value', 403))
  }
}
